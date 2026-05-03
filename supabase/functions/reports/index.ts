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
    const today = new Date().toISOString().split('T')[0]
    const monthStart = today.slice(0, 7) + '-01'

    const [
      { count: totalSuppliers },
      { count: totalCustomers },
      { data: recentDeliveries },
      { data: payments },
      { data: receipts },
      { data: allDeliveries },
      { data: supplierPaymentsBySupplier },
      { data: customerReceiptsByCustomer },
    ] = await Promise.all([
      db.from('Supplier').select('*', { count: 'exact', head: true }).eq('isActive', true),
      db.from('Customer').select('*', { count: 'exact', head: true }).eq('isActive', true),
      db.from('Delivery')
        .select('*, supplier:Supplier(id,name), commodity:Commodity(id,name)')
        .order('deliveryDate', { ascending: false })
        .limit(10),
      db.from('SupplierPayment').select('amount, supplierId'),
      db.from('CustomerReceipt').select('amount, customerId'),
      db.from('Delivery').select('purchaseValue, saleValue, grossMargin, netPayable, adjustedWeight, deliveryDate, supplierId, customerId, supplier:Supplier(id,name), customer:Customer(id,name)'),
      db.from('SupplierPayment').select('amount, supplierId, supplier:Supplier(id,name)'),
      db.from('CustomerReceipt').select('amount, customerId, customer:Customer(id,name)'),
    ])

    // Totals across all time
    const totalPurchaseValue = (allDeliveries || []).reduce((s: number, d: any) => s + Number(d.purchaseValue ?? 0), 0)
    const totalSaleValue = (allDeliveries || []).reduce((s: number, d: any) => s + Number(d.saleValue ?? 0), 0)
    const totalMargin = (allDeliveries || []).reduce((s: number, d: any) => s + Number(d.grossMargin ?? 0), 0)
    const totalPaid = (payments || []).reduce((s: number, p: any) => s + Number(p.amount), 0)
    const totalReceived = (receipts || []).reduce((s: number, r: any) => s + Number(r.amount), 0)

    // Today
    const todayDeliveries = (allDeliveries || []).filter((d: any) => d.deliveryDate?.startsWith(today))
    const todayWeight = todayDeliveries.reduce((s: number, d: any) => s + Number(d.adjustedWeight ?? 0), 0)
    const todayPurchaseValue = todayDeliveries.reduce((s: number, d: any) => s + Number(d.purchaseValue ?? 0), 0)
    const todaySaleValue = todayDeliveries.reduce((s: number, d: any) => s + Number(d.saleValue ?? 0), 0)

    // This month
    const monthDeliveries = (allDeliveries || []).filter((d: any) => d.deliveryDate >= monthStart)
    const monthWeight = monthDeliveries.reduce((s: number, d: any) => s + Number(d.adjustedWeight ?? 0), 0)
    const monthPurchaseValue = monthDeliveries.reduce((s: number, d: any) => s + Number(d.purchaseValue ?? 0), 0)
    const monthSaleValue = monthDeliveries.reduce((s: number, d: any) => s + Number(d.saleValue ?? 0), 0)
    const monthMargin = monthDeliveries.reduce((s: number, d: any) => s + Number(d.grossMargin ?? 0), 0)

    // Per-supplier outstanding (purchase value - paid)
    const paidBySupplier: Record<string, number> = {}
    for (const p of (supplierPaymentsBySupplier || [])) {
      paidBySupplier[p.supplierId] = (paidBySupplier[p.supplierId] ?? 0) + Number(p.amount)
    }
    const purchaseBySupplier: Record<string, { name: string; totalPurchase: number; totalPaid: number }> = {}
    for (const d of (allDeliveries || [])) {
      if (!d.supplierId) continue
      if (!purchaseBySupplier[d.supplierId]) purchaseBySupplier[d.supplierId] = { name: d.supplier?.name ?? d.supplierId, totalPurchase: 0, totalPaid: 0 }
      purchaseBySupplier[d.supplierId].totalPurchase += Number(d.purchaseValue ?? 0)
    }
    for (const [sid, val] of Object.entries(purchaseBySupplier)) {
      val.totalPaid = paidBySupplier[sid] ?? 0
    }
    const topSupplierPayables = Object.entries(purchaseBySupplier)
      .map(([id, v]) => ({ supplierId: id, name: v.name, outstanding: v.totalPurchase - v.totalPaid, totalPurchase: v.totalPurchase }))
      .filter(s => s.outstanding > 0)
      .sort((a, b) => b.outstanding - a.outstanding)
      .slice(0, 5)

    // Per-customer outstanding (sale value - received)
    const receivedByCustomer: Record<string, number> = {}
    for (const r of (customerReceiptsByCustomer || [])) {
      receivedByCustomer[r.customerId] = (receivedByCustomer[r.customerId] ?? 0) + Number(r.amount)
    }
    const saleByCustomer: Record<string, { name: string; totalSale: number; totalReceived: number }> = {}
    for (const d of (allDeliveries || [])) {
      if (!d.customerId) continue
      if (!saleByCustomer[d.customerId]) saleByCustomer[d.customerId] = { name: d.customer?.name ?? d.customerId, totalSale: 0, totalReceived: 0 }
      saleByCustomer[d.customerId].totalSale += Number(d.saleValue ?? 0)
    }
    for (const [cid, val] of Object.entries(saleByCustomer)) {
      val.totalReceived = receivedByCustomer[cid] ?? 0
    }
    const topCustomerReceivables = Object.entries(saleByCustomer)
      .map(([id, v]) => ({ customerId: id, name: v.name, outstanding: v.totalSale - v.totalReceived, totalSale: v.totalSale }))
      .filter(c => c.outstanding > 0)
      .sort((a, b) => b.outstanding - a.outstanding)
      .slice(0, 5)

    const totalDeliveries = (allDeliveries || []).length
    const totalWeightQt = (allDeliveries || []).reduce((s: number, d: any) => s + Number(d.adjustedWeight ?? 0), 0)

    return json({
      totalSuppliers, totalCustomers,
      recentDeliveries,
      totalPayable: totalPurchaseValue - totalPaid,
      totalReceivable: totalSaleValue - totalReceived,
      today: {
        deliveryCount: todayDeliveries.length,
        totalWeightQt: todayWeight,
        purchaseValue: todayPurchaseValue,
        saleValue: todaySaleValue,
        margin: todaySaleValue - todayPurchaseValue,
      },
      thisMonth: {
        deliveryCount: monthDeliveries.length,
        totalWeightQt: monthWeight,
        purchaseValue: monthPurchaseValue,
        saleValue: monthSaleValue,
        margin: monthMargin,
      },
      overall: {
        deliveryCount: totalDeliveries,
        totalWeightQt,
        purchaseValue: totalPurchaseValue,
        saleValue: totalSaleValue,
        margin: totalMargin,
      },
      topSupplierPayables,
      topCustomerReceivables,
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

  // GET /reports/stock — commodity-level stock summary from deliveries
  if (req.method === 'GET' && report === 'stock') {
    const { data: deliveries } = await db.from('Delivery')
      .select('adjustedWeight, purchaseValue, saleValue, commodity:Commodity(id,name)')
    const byComm: Record<string, { commodityId: string; name: string; totalWeight: number; totalPurchase: number; totalSale: number }> = {}
    for (const d of (deliveries || [])) {
      const cid = (d.commodity as any)?.id ?? 'unknown'
      if (!byComm[cid]) byComm[cid] = { commodityId: cid, name: (d.commodity as any)?.name ?? cid, totalWeight: 0, totalPurchase: 0, totalSale: 0 }
      byComm[cid].totalWeight += Number(d.adjustedWeight ?? 0)
      byComm[cid].totalPurchase += Number(d.purchaseValue ?? 0)
      byComm[cid].totalSale += Number(d.saleValue ?? 0)
    }
    return json(Object.values(byComm))
  }

  return error('Not found', 404)
})
