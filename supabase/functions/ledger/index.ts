import { corsResponse, json, error } from '../_shared/cors.ts'
import { requireAuth, getAdminClient } from '../_shared/auth.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsResponse()

  const { user, response: authResponse } = await requireAuth(req)
  if (authResponse) return authResponse

  const db = getAdminClient()
  const url = new URL(req.url)
  const parts = url.pathname.split('/').filter(Boolean)

  // POST /ledger/entries — manual ledger entry (bank statement import will use this)
  if (req.method === 'POST' && parts[parts.length - 1] === 'entries') {
    const body = await req.json()
    const now = new Date().toISOString()
    const { data, error: dbErr } = await db.from('LedgerEntry')
      .insert({ ...body, id: crypto.randomUUID(), createdAt: now, updatedAt: now })
      .select('*')
      .single()
    if (dbErr) return error(dbErr.message)
    return json(data, 201)
  }

  // DELETE /ledger/entries/:id
  if (req.method === 'DELETE' && parts[parts.indexOf('ledger') + 1] === 'entries') {
    const id = parts[parts.indexOf('entries') + 1]
    if (!id) return error('Missing entry id', 400)
    const { error: dbErr } = await db.from('LedgerEntry').delete().eq('id', id)
    if (dbErr) return error(dbErr.message)
    return json({ success: true })
  }

  // GET /ledger/summary — aggregated P&L for tax report
  if (req.method === 'GET' && parts[parts.indexOf('ledger') + 1] === 'summary') {
    const from = url.searchParams.get('from')
    const to = url.searchParams.get('to')

    let deliveryQ = db.from('Delivery')
      .select('*, supplier:Supplier(id,name), customer:Customer(id,name), commodity:Commodity(id,name,hsnCode)')
      .order('deliveryDate')
    if (from) deliveryQ = deliveryQ.gte('deliveryDate', from)
    if (to) deliveryQ = deliveryQ.lte('deliveryDate', to)
    const { data: deliveries } = await deliveryQ

    let invoiceQ = db.from('Invoice')
      .select('*, customer:Customer(id,name), commodity:Commodity(id,name,hsnCode), items:InvoiceItem(*)')
      .eq('status', 'SENT')
      .order('invoiceDate')
    if (from) invoiceQ = invoiceQ.gte('invoiceDate', from)
    if (to) invoiceQ = invoiceQ.lte('invoiceDate', to)
    const { data: invoices } = await invoiceQ

    let spayQ = db.from('SupplierPayment')
      .select('*, supplier:Supplier(id,name)')
      .order('paymentDate')
    if (from) spayQ = spayQ.gte('paymentDate', from)
    if (to) spayQ = spayQ.lte('paymentDate', to)
    const { data: supplierPayments } = await spayQ

    let crQ = db.from('CustomerReceipt')
      .select('*, customer:Customer(id,name)')
      .order('receiptDate')
    if (from) crQ = crQ.gte('receiptDate', from)
    if (to) crQ = crQ.lte('receiptDate', to)
    const { data: customerReceipts } = await crQ

    let manualQ = db.from('LedgerEntry').select('*').order('entryDate')
    if (from) manualQ = manualQ.gte('entryDate', from)
    if (to) manualQ = manualQ.lte('entryDate', to)
    const { data: manualEntries } = await manualQ

    const totalSales = (deliveries || []).reduce((s: number, d: any) => s + Number(d.saleValue ?? 0), 0)
    const totalPurchases = (deliveries || []).reduce((s: number, d: any) => s + Number(d.purchaseValue ?? 0), 0)
    const totalCess = (deliveries || []).reduce((s: number, d: any) => s + Number(d.cessPaid ?? 0), 0)
    // Margin is net of cess (1% of sale) and moisture deduction (only when mc > 14%), both based on sale rate.
    const totalCessOnSale = (deliveries || []).reduce((s: number, d: any) => s + Number(d.saleValue ?? 0) * 0.01, 0)
    const totalMcDeduction = (deliveries || []).reduce((s: number, d: any) => {
      const mc = Number(d.moisturePct ?? 0)
      const sv = Number(d.saleValue ?? 0)
      return s + (mc > 14 ? ((mc - 14) / 100) * sv : 0)
    }, 0)
    const grossMargin = totalSales - totalPurchases - totalCessOnSale - totalMcDeduction
    const totalSupplierPaid = (supplierPayments || []).reduce((s: number, p: any) => s + Number(p.amount), 0)
    const totalCustomerReceived = (customerReceipts || []).reduce((s: number, r: any) => s + Number(r.amount), 0)
    const totalManualDebits = (manualEntries || []).filter((e: any) => e.type === 'DEBIT').reduce((s: number, e: any) => s + Number(e.amount), 0)
    const totalManualCredits = (manualEntries || []).filter((e: any) => e.type === 'CREDIT').reduce((s: number, e: any) => s + Number(e.amount), 0)

    return json({
      summary: {
        totalSales,
        totalPurchases,
        grossMargin,
        grossMarginPct: totalSales > 0 ? (grossMargin / totalSales) * 100 : 0,
        totalCess,
        totalSupplierPaid,
        supplierOutstanding: totalPurchases - totalSupplierPaid,
        totalCustomerReceived,
        customerOutstanding: totalSales - totalCustomerReceived,
        totalManualDebits,
        totalManualCredits,
        deliveryCount: (deliveries || []).length,
        invoiceCount: (invoices || []).length,
      },
      deliveries: deliveries || [],
      invoices: invoices || [],
      supplierPayments: supplierPayments || [],
      customerReceipts: customerReceipts || [],
      manualEntries: manualEntries || [],
    })
  }

  return error('Not found', 404)
})
