import { corsResponse, json, error } from '../_shared/cors.ts'
import { requireAuth, requireRole, getAdminClient } from '../_shared/auth.ts'
import { getNextNumber } from '../_shared/sequence.ts'

const MC_THRESHOLD_PCT = 14
const CESS_RATE = 0.01

function calcDelivery(data: {
  grossWeight?: number; tareWeight?: number
  qualityDeductionPct?: number; purchaseRate?: number; saleRate?: number
  moisturePct?: number; cessApplicable?: boolean; cessPaid?: number
}) {
  const gross = Number(data.grossWeight ?? 0)
  const tare = Number(data.tareWeight ?? 0)
  const qd = Number(data.qualityDeductionPct ?? 0)
  const netWeight = gross - tare
  const adjustedWeight = netWeight * (1 - qd / 100)
  const purchaseValue = data.purchaseRate ? adjustedWeight * Number(data.purchaseRate) : null
  const saleValue = data.saleRate ? adjustedWeight * Number(data.saleRate) : null
  const grossMargin = saleValue !== null && purchaseValue !== null ? saleValue - purchaseValue : null

  const mc = Number(data.moisturePct ?? 0)
  const mcDeduction = saleValue !== null && mc > MC_THRESHOLD_PCT
    ? ((mc - MC_THRESHOLD_PCT) / 100) * saleValue
    : 0
  const cessPaid = Number(data.cessPaid ?? 0)
  const balanceCess = saleValue !== null
    ? (data.cessApplicable ? saleValue * CESS_RATE - cessPaid : -cessPaid)
    : null
  const netPayable = purchaseValue !== null && balanceCess !== null
    ? purchaseValue - balanceCess - mcDeduction
    : null

  return { netWeight, adjustedWeight, purchaseValue, saleValue, grossMargin, netPayable }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsResponse()

  const { user, response: authResponse } = await requireAuth(req)
  if (authResponse) return authResponse

  const db = getAdminClient()
  const url = new URL(req.url)
  const parts = url.pathname.split('/').filter(Boolean)
  const last = parts[parts.length - 1]
  const secondLast = parts[parts.length - 2]

  // PATCH /deliveries/:id/status
  if (req.method === 'PATCH' && last === 'status') {
    const id = secondLast
    const { status } = await req.json()
    const { data, error: dbErr } = await db.from('Delivery').update({ status }).eq('id', id).select().single()
    if (dbErr) return error(dbErr.message)
    return json(data)
  }

  // GET /deliveries/supplier/:supplierId/outstanding
  if (req.method === 'GET' && last === 'outstanding') {
    const supplierId = parts[parts.length - 2]
    const { data: deliveries } = await db.from('Delivery')
      .select('*, supplierPaymentAllocations:SupplierPaymentAllocation(*)')
      .eq('supplierId', supplierId)
    const result = (deliveries || []).map((d: any) => {
      const paid = (d.supplierPaymentAllocations || []).reduce((s: number, a: any) => s + Number(a.allocatedAmount), 0)
      return { ...d, paidAmount: paid, outstandingAmount: Number(d.purchaseValue) - paid }
    })
    return json(result)
  }

  const id = last !== 'deliveries' ? last : null

  // GET /deliveries
  if (req.method === 'GET' && !id) {
    const { supplierId, customerId, from, to } = Object.fromEntries(url.searchParams)
    let query = db.from('Delivery')
      .select('*, supplier:Supplier(id,name), customer:Customer(id,name), commodity:Commodity(id,name)')
      .order('lrNumber', { ascending: true, nullsFirst: false })
    if (supplierId) query = query.eq('supplierId', supplierId)
    if (customerId) query = query.eq('customerId', customerId)
    if (from) query = query.gte('deliveryDate', from)
    if (to) query = query.lte('deliveryDate', to)
    const { data } = await query
    return json(data)
  }

  // GET /deliveries/:id
  if (req.method === 'GET' && id) {
    const { data } = await db.from('Delivery')
      .select('*, supplier:Supplier(*), customer:Customer(*), commodity:Commodity(id,name), supplierPaymentAllocations:SupplierPaymentAllocation(*, payment:SupplierPayment(*)), customerReceiptAllocations:CustomerReceiptAllocation(*, receipt:CustomerReceipt(*))')
      .eq('id', id).single()
    return json(data)
  }

  // POST /deliveries
  if (req.method === 'POST') {
    const body = await req.json()
    const deliveryNumber = await getNextNumber(db, 'LR')
    const calc = calcDelivery(body)
    const now = new Date().toISOString()
    const { data, error: dbErr } = await db.from('Delivery')
      .insert({ ...body, id: crypto.randomUUID(), deliveryNumber, ...calc, createdAt: now, updatedAt: now })
      .select('*, supplier:Supplier(id,name), customer:Customer(id,name), commodity:Commodity(id,name)')
      .single()
    if (dbErr) return error(dbErr.message)
    return json(data, 201)
  }

  // PUT /deliveries/:id
  if (req.method === 'PUT' && id) {
    const body = await req.json()
    const { data: existing } = await db.from('Delivery').select('*').eq('id', id).single()
    if (!existing) return error('Delivery not found', 404)
    const merged = { ...existing, ...body }
    const calc = calcDelivery({
      grossWeight: Number(merged.grossWeight), tareWeight: Number(merged.tareWeight),
      qualityDeductionPct: Number(merged.qualityDeductionPct ?? 0),
      purchaseRate: merged.purchaseRate ? Number(merged.purchaseRate) : undefined,
      saleRate: merged.saleRate ? Number(merged.saleRate) : undefined,
      moisturePct: Number(merged.moisturePct ?? 0),
      cessApplicable: !!merged.cessApplicable,
      cessPaid: Number(merged.cessPaid ?? 0),
    })
    const { data, error: dbErr } = await db.from('Delivery').update({ ...body, ...calc, updatedAt: new Date().toISOString() }).eq('id', id)
      .select('*, supplier:Supplier(id,name), customer:Customer(id,name), commodity:Commodity(id,name)')
      .single()
    if (dbErr) return error(dbErr.message)
    return json(data)
  }

  // DELETE /deliveries/:id
  if (req.method === 'DELETE' && id) {
    const roleCheck = requireRole(user.role, 'ADMIN')
    if (roleCheck) return roleCheck
    const { data: allocs } = await db.from('SupplierPaymentAllocation').select('id').eq('deliveryId', id).limit(1)
    const { data: recAllocs } = await db.from('CustomerReceiptAllocation').select('id').eq('deliveryId', id).limit(1)
    if ((allocs && allocs.length > 0) || (recAllocs && recAllocs.length > 0)) {
      return error('Cannot delete a delivery that has payment allocations')
    }
    await db.from('Delivery').delete().eq('id', id)
    return json({ success: true })
  }

  return error('Not found', 404)
})
