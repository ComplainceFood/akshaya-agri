import { corsResponse, json, error } from '../_shared/cors.ts'
import { requireAuth, requireRole, getAdminClient } from '../_shared/auth.ts'
import { getNextNumber } from '../_shared/sequence.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsResponse()

  const { user, response: authResponse } = await requireAuth(req)
  if (authResponse) return authResponse

  const db = getAdminClient()
  const url = new URL(req.url)
  const parts = url.pathname.split('/').filter(Boolean)

  // Routes: /payments/supplier, /payments/supplier/:id, /payments/supplier/:supplierId/ledger
  // Routes: /payments/customer, /payments/customer/:id, /payments/customer/:customerId/ledger
  const type = parts[parts.indexOf('payments') + 1] // 'supplier' or 'customer'
  const thirdPart = parts[parts.indexOf('payments') + 2] // id or undefined
  const fourthPart = parts[parts.indexOf('payments') + 3] // 'ledger' or undefined

  if (!type || !['supplier', 'customer'].includes(type)) return error('Not found', 404)

  const isLedger = fourthPart === 'ledger'
  const isSupplier = type === 'supplier'

  // GET /payments/supplier/:supplierId/ledger
  if (req.method === 'GET' && isLedger && isSupplier) {
    const supplierId = thirdPart
    const { data: deliveries } = await db.from('Delivery').select('*').eq('supplierId', supplierId).order('deliveryDate')
    const { data: payments } = await db.from('SupplierPayment').select('*').eq('supplierId', supplierId).order('paymentDate')
    const totalPurchase = (deliveries || []).reduce((s: number, d: any) => s + Number(d.purchaseValue), 0)
    const totalPaid = (payments || []).reduce((s: number, p: any) => s + Number(p.amount), 0)
    return json({ deliveries, payments, totalPurchase, totalPaid, outstanding: totalPurchase - totalPaid })
  }

  // GET /payments/customer/:customerId/ledger
  if (req.method === 'GET' && isLedger && !isSupplier) {
    const customerId = thirdPart
    const { data: deliveries } = await db.from('Delivery').select('*').eq('customerId', customerId).order('deliveryDate')
    const { data: receipts } = await db.from('CustomerReceipt').select('*').eq('customerId', customerId).order('receiptDate')
    const totalSale = (deliveries || []).reduce((s: number, d: any) => s + Number(d.saleValue ?? 0), 0)
    const totalReceived = (receipts || []).reduce((s: number, r: any) => s + Number(r.amount), 0)
    return json({ deliveries, receipts, totalSale, totalReceived, outstanding: totalSale - totalReceived })
  }

  // GET /payments/supplier
  if (req.method === 'GET' && isSupplier && !thirdPart) {
    const supplierId = url.searchParams.get('supplierId')
    let query = db.from('SupplierPayment').select('*, supplier:Supplier(id,name), allocations:SupplierPaymentAllocation(*)').order('paymentDate', { ascending: false })
    if (supplierId) query = query.eq('supplierId', supplierId)
    const { data } = await query
    return json(data)
  }

  // GET /payments/customer
  if (req.method === 'GET' && !isSupplier && !thirdPart) {
    const customerId = url.searchParams.get('customerId')
    let query = db.from('CustomerReceipt').select('*, customer:Customer(id,name), allocations:CustomerReceiptAllocation(*)').order('receiptDate', { ascending: false })
    if (customerId) query = query.eq('customerId', customerId)
    const { data } = await query
    return json(data)
  }

  // POST /payments/supplier
  if (req.method === 'POST' && isSupplier && !thirdPart) {
    const body = await req.json()
    const { allocations, ...paymentData } = body
    const paymentNumber = await getNextNumber(db, 'SPAY')
    const now = new Date().toISOString()
    const { data: payment, error: dbErr } = await db.from('SupplierPayment')
      .insert({ ...paymentData, id: crypto.randomUUID(), paymentNumber, createdAt: now, updatedAt: now })
      .select('*, supplier:Supplier(*)')
      .single()
    if (dbErr) return error(dbErr.message)
    if (allocations?.length) {
      await db.from('SupplierPaymentAllocation').insert(allocations.map((a: any) => ({ ...a, id: crypto.randomUUID(), paymentId: payment.id })))
    }
    return json(payment, 201)
  }

  // POST /payments/customer
  if (req.method === 'POST' && !isSupplier && !thirdPart) {
    const body = await req.json()
    const { allocations, ...receiptData } = body
    const receiptNumber = await getNextNumber(db, 'CREC')
    const now = new Date().toISOString()
    const { data: receipt, error: dbErr } = await db.from('CustomerReceipt')
      .insert({ ...receiptData, id: crypto.randomUUID(), receiptNumber, createdAt: now, updatedAt: now })
      .select('*, customer:Customer(*)')
      .single()
    if (dbErr) return error(dbErr.message)
    if (allocations?.length) {
      await db.from('CustomerReceiptAllocation').insert(allocations.map((a: any) => ({ ...a, id: crypto.randomUUID(), receiptId: receipt.id })))
    }
    return json(receipt, 201)
  }

  // PUT /payments/supplier/:id
  if (req.method === 'PUT' && isSupplier && thirdPart && !isLedger) {
    const roleCheck = requireRole(user.role, 'ADMIN', 'ACCOUNTS')
    if (roleCheck) return roleCheck
    const body = await req.json()
    const { data, error: dbErr } = await db.from('SupplierPayment').update(body).eq('id', thirdPart).select('*, supplier:Supplier(*), allocations:SupplierPaymentAllocation(*)').single()
    if (dbErr) return error(dbErr.message)
    return json(data)
  }

  // PUT /payments/customer/:id
  if (req.method === 'PUT' && !isSupplier && thirdPart && !isLedger) {
    const roleCheck = requireRole(user.role, 'ADMIN', 'ACCOUNTS')
    if (roleCheck) return roleCheck
    const body = await req.json()
    const { data, error: dbErr } = await db.from('CustomerReceipt').update(body).eq('id', thirdPart).select('*, customer:Customer(*), allocations:CustomerReceiptAllocation(*)').single()
    if (dbErr) return error(dbErr.message)
    return json(data)
  }

  // DELETE /payments/supplier/:id
  if (req.method === 'DELETE' && isSupplier && thirdPart) {
    const roleCheck = requireRole(user.role, 'ADMIN', 'ACCOUNTS')
    if (roleCheck) return roleCheck
    await db.from('SupplierPaymentAllocation').delete().eq('paymentId', thirdPart)
    await db.from('SupplierPayment').delete().eq('id', thirdPart)
    return json({ success: true })
  }

  // DELETE /payments/customer/:id
  if (req.method === 'DELETE' && !isSupplier && thirdPart) {
    const roleCheck = requireRole(user.role, 'ADMIN', 'ACCOUNTS')
    if (roleCheck) return roleCheck
    await db.from('CustomerReceiptAllocation').delete().eq('receiptId', thirdPart)
    await db.from('CustomerReceipt').delete().eq('id', thirdPart)
    return json({ success: true })
  }

  return error('Not found', 404)
})
