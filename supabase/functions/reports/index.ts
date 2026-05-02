import { corsResponse, json, error } from '../_shared/cors.ts'
import { requireAuth, getAdminClient } from '../_shared/auth.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsResponse()

  const { user, response: authResponse } = await requireAuth(req)
  if (authResponse) return authResponse

  const db = getAdminClient()
  const url = new URL(req.url)
  const parts = url.pathname.split('/').filter(Boolean)
  const report = parts[parts.length - 1]

  // GET /reports/dashboard
  if (req.method === 'GET' && report === 'dashboard') {
    const [
      { count: totalSuppliers },
      { count: totalCustomers },
      { count: pendingPOs },
      { count: pendingSOs },
      { data: recentDeliveries },
      { data: payments },
      { data: receipts },
      { data: deliveriesForOutstanding },
    ] = await Promise.all([
      db.from('Supplier').select('*', { count: 'exact', head: true }).eq('isActive', true),
      db.from('Customer').select('*', { count: 'exact', head: true }).eq('isActive', true),
      db.from('PurchaseOrder').select('*', { count: 'exact', head: true }).in('status', ['CONFIRMED', 'IN_PROGRESS']),
      db.from('SalesOrder').select('*', { count: 'exact', head: true }).in('status', ['CONFIRMED', 'IN_PROGRESS']),
      db.from('Delivery').select('*, supplier:Supplier(id,name), customer:Customer(id,name)').order('deliveryDate', { ascending: false }).limit(10),
      db.from('SupplierPayment').select('amount'),
      db.from('CustomerReceipt').select('amount'),
      db.from('Delivery').select('purchaseValue, saleValue, supplierPaymentAllocations:SupplierPaymentAllocation(allocatedAmount), customerReceiptAllocations:CustomerReceiptAllocation(allocatedAmount)'),
    ])

    const totalPurchaseValue = (deliveriesForOutstanding || []).reduce((s: number, d: any) => s + Number(d.purchaseValue), 0)
    const totalSaleValue = (deliveriesForOutstanding || []).reduce((s: number, d: any) => s + Number(d.saleValue ?? 0), 0)
    const totalPaid = (payments || []).reduce((s: number, p: any) => s + Number(p.amount), 0)
    const totalReceived = (receipts || []).reduce((s: number, r: any) => s + Number(r.amount), 0)

    return json({
      totalSuppliers, totalCustomers, pendingPOs, pendingSOs,
      recentDeliveries,
      outstandingPayable: totalPurchaseValue - totalPaid,
      outstandingReceivable: totalSaleValue - totalReceived,
    })
  }

  // GET /reports/pnl
  if (req.method === 'GET' && report === 'pnl') {
    const from = url.searchParams.get('from')
    const to = url.searchParams.get('to')
    let query = db.from('Delivery').select('deliveryDate, purchaseValue, saleValue, grossMargin, supplier:Supplier(name), customer:Customer(name), commodity:Commodity(name)')
    if (from) query = query.gte('deliveryDate', from)
    if (to) query = query.lte('deliveryDate', to)
    const { data: deliveries } = await query.order('deliveryDate', { ascending: false })

    const totalPurchase = (deliveries || []).reduce((s: number, d: any) => s + Number(d.purchaseValue), 0)
    const totalSale = (deliveries || []).reduce((s: number, d: any) => s + Number(d.saleValue ?? 0), 0)
    const totalMargin = (deliveries || []).reduce((s: number, d: any) => s + Number(d.grossMargin ?? 0), 0)

    return json({ deliveries, totalPurchase, totalSale, totalMargin })
  }

  // GET /reports/stock
  if (req.method === 'GET' && report === 'stock') {
    const { data: orders } = await db.from('PurchaseOrder')
      .select('*, supplier:Supplier(name), commodity:Commodity(name), deliveries:Delivery(adjustedWeight)')
      .in('status', ['CONFIRMED', 'IN_PROGRESS'])
    const result = (orders || []).map((o: any) => {
      const delivered = (o.deliveries || []).reduce((s: number, d: any) => s + Number(d.adjustedWeight), 0)
      return { ...o, deliveredWeight: delivered, pendingWeight: Number(o.quantityOrdered) - delivered }
    })
    return json(result)
  }

  return error('Not found', 404)
})
