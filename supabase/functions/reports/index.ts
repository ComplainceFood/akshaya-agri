import { corsResponse, json, error } from '../_shared/cors.ts'
import { requireAuth, getAdminClient } from '../_shared/auth.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsResponse()

  const { response: authResponse } = await requireAuth(req)
  if (authResponse) return authResponse

  const db = getAdminClient()
  const url = new URL(req.url)
  const parts = url.pathname.split('/').filter(Boolean)
  const report = parts[parts.length - 1]

  // ── GET /reports/dashboard ──────────────────────────────────────────────────
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
      db.from('Delivery').select('purchaseValue, saleValue, grossMargin, netPayable, adjustedWeight, saleRate, deliveryDate, supplierId, customerId, supplier:Supplier(id,name), customer:Customer(id,name)'),
      db.from('SupplierPayment').select('amount, supplierId, supplier:Supplier(id,name)'),
      db.from('CustomerReceipt').select('amount, customerId, customer:Customer(id,name)'),
    ])

    const totalPurchaseValue = (allDeliveries || []).reduce((s: number, d: any) => s + Number(d.purchaseValue ?? 0), 0)
    const totalSaleValue = (allDeliveries || []).reduce((s: number, d: any) => s + Number(d.saleValue ?? 0), 0)
    const totalMargin = (allDeliveries || []).reduce((s: number, d: any) => s + Number(d.grossMargin ?? 0), 0)
    const totalPaid = (payments || []).reduce((s: number, p: any) => s + Number(p.amount), 0)
    const totalReceived = (receipts || []).reduce((s: number, r: any) => s + Number(r.amount), 0)

    const todayDeliveries = (allDeliveries || []).filter((d: any) => d.deliveryDate?.startsWith(today))
    const todayWeight = todayDeliveries.reduce((s: number, d: any) => s + Number(d.adjustedWeight ?? 0), 0)
    const todayPurchaseValue = todayDeliveries.reduce((s: number, d: any) => s + Number(d.purchaseValue ?? 0), 0)
    const todaySaleValue = todayDeliveries.reduce((s: number, d: any) => s + Number(d.saleValue ?? 0), 0)

    const monthDeliveries = (allDeliveries || []).filter((d: any) => d.deliveryDate >= monthStart)
    const monthWeight = monthDeliveries.reduce((s: number, d: any) => s + Number(d.adjustedWeight ?? 0), 0)
    const monthPurchaseValue = monthDeliveries.reduce((s: number, d: any) => s + Number(d.purchaseValue ?? 0), 0)
    const monthSaleValue = monthDeliveries.reduce((s: number, d: any) => s + Number(d.saleValue ?? 0), 0)
    const monthMargin = monthDeliveries.reduce((s: number, d: any) => s + Number(d.grossMargin ?? 0), 0)

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
    for (const [sid, val] of Object.entries(purchaseBySupplier)) val.totalPaid = paidBySupplier[sid] ?? 0
    const topSupplierPayables = Object.entries(purchaseBySupplier)
      .map(([id, v]) => ({ supplierId: id, name: v.name, outstanding: v.totalPurchase - v.totalPaid, totalPurchase: v.totalPurchase }))
      .filter(s => s.outstanding > 0).sort((a, b) => b.outstanding - a.outstanding).slice(0, 5)

    const receivedByCustomer: Record<string, number> = {}
    for (const r of (customerReceiptsByCustomer || [])) {
      receivedByCustomer[r.customerId] = (receivedByCustomer[r.customerId] ?? 0) + Number(r.amount)
    }
    // Customer outstanding tracks the gross invoiced amount (rate × weight), not net realisation.
    const saleByCustomer: Record<string, { name: string; totalSale: number; totalGrossSale: number; totalReceived: number }> = {}
    for (const d of (allDeliveries || [])) {
      if (!d.customerId) continue
      if (!saleByCustomer[d.customerId]) saleByCustomer[d.customerId] = { name: d.customer?.name ?? d.customerId, totalSale: 0, totalGrossSale: 0, totalReceived: 0 }
      saleByCustomer[d.customerId].totalSale += Number(d.saleValue ?? 0)
      saleByCustomer[d.customerId].totalGrossSale += Number(d.adjustedWeight ?? 0) * Number(d.saleRate ?? 0)
    }
    for (const [cid, val] of Object.entries(saleByCustomer)) val.totalReceived = receivedByCustomer[cid] ?? 0
    const topCustomerReceivables = Object.entries(saleByCustomer)
      .map(([id, v]) => ({ customerId: id, name: v.name, outstanding: v.totalGrossSale - v.totalReceived, totalSale: v.totalSale }))
      .filter(c => c.outstanding > 0).sort((a, b) => b.outstanding - a.outstanding).slice(0, 5)

    // ── Daily last 30 days ──────────────────────────────────────────────────
    const thirtyDaysAgo = new Date(); thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 29)
    const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().split('T')[0]
    const dailyMap: Record<string, { date: string; deliveries: number; purchaseValue: number; saleValue: number; margin: number }> = {}
    for (let i = 0; i < 30; i++) {
      const d = new Date(); d.setDate(d.getDate() - (29 - i))
      const key = d.toISOString().split('T')[0]
      dailyMap[key] = { date: key, deliveries: 0, purchaseValue: 0, saleValue: 0, margin: 0 }
    }
    for (const d of (allDeliveries || [])) {
      const key = d.deliveryDate?.split('T')[0]
      if (key && dailyMap[key]) {
        dailyMap[key].deliveries++
        dailyMap[key].purchaseValue += Number(d.purchaseValue ?? 0)
        dailyMap[key].saleValue += Number(d.saleValue ?? 0)
        dailyMap[key].margin += Number(d.grossMargin ?? 0)
      }
    }
    const dailyTrend = Object.values(dailyMap).sort((a, b) => a.date.localeCompare(b.date))

    // ── Monthly last 6 months ───────────────────────────────────────────────
    const monthlyMap: Record<string, { month: string; purchaseValue: number; saleValue: number; margin: number; deliveries: number }> = {}
    for (let i = 5; i >= 0; i--) {
      const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - i)
      const key = d.toISOString().slice(0, 7)
      monthlyMap[key] = { month: key, purchaseValue: 0, saleValue: 0, margin: 0, deliveries: 0 }
    }
    for (const d of (allDeliveries || [])) {
      const key = d.deliveryDate?.slice(0, 7)
      if (key && monthlyMap[key]) {
        monthlyMap[key].purchaseValue += Number(d.purchaseValue ?? 0)
        monthlyMap[key].saleValue += Number(d.saleValue ?? 0)
        monthlyMap[key].margin += Number(d.grossMargin ?? 0)
        monthlyMap[key].deliveries++
      }
    }
    const monthlyTrend = Object.values(monthlyMap).sort((a, b) => a.month.localeCompare(b.month))

    // ── Commodity breakdown ─────────────────────────────────────────────────
    const { data: commDeliveries } = await db.from('Delivery')
      .select('purchaseValue, saleValue, grossMargin, adjustedWeight, commodity:Commodity(id,name)')
    const commMap: Record<string, any> = {}
    for (const d of (commDeliveries || [])) {
      const cid = (d.commodity as any)?.id ?? 'unknown'
      const cname = (d.commodity as any)?.name ?? 'Unknown'
      if (!commMap[cid]) commMap[cid] = { id: cid, name: cname, saleValue: 0, margin: 0, weight: 0 }
      commMap[cid].saleValue += Number(d.saleValue ?? 0)
      commMap[cid].margin += Number(d.grossMargin ?? 0)
      commMap[cid].weight += Number(d.adjustedWeight ?? 0)
    }
    const commodityBreakdown = Object.values(commMap).sort((a: any, b: any) => b.saleValue - a.saleValue)

    return json({
      totalSuppliers, totalCustomers,
      recentDeliveries,
      totalPayable: totalPurchaseValue - totalPaid,
      totalReceivable: totalSaleValue - totalReceived,
      today: { deliveryCount: todayDeliveries.length, totalWeightQt: todayWeight, purchaseValue: todayPurchaseValue, saleValue: todaySaleValue, margin: todaySaleValue - todayPurchaseValue },
      thisMonth: { deliveryCount: monthDeliveries.length, totalWeightQt: monthWeight, purchaseValue: monthPurchaseValue, saleValue: monthSaleValue, margin: monthMargin },
      overall: {
        deliveryCount: (allDeliveries || []).length,
        totalWeightQt: (allDeliveries || []).reduce((s: number, d: any) => s + Number(d.adjustedWeight ?? 0), 0),
        purchaseValue: totalPurchaseValue, saleValue: totalSaleValue, margin: totalMargin,
      },
      topSupplierPayables, topCustomerReceivables,
      dailyTrend, monthlyTrend, commodityBreakdown,
    })
  }

  // ── GET /reports/pnl ───────────────────────────────────────────────────────
  if (req.method === 'GET' && report === 'pnl') {
    const from = url.searchParams.get('from')
    const to = url.searchParams.get('to')
    const commodityId = url.searchParams.get('commodityId')
    let query = db.from('Delivery').select(
      'id, deliveryNumber, lrNumber, deliveryDate, adjustedWeight, purchaseRate, saleRate, purchaseValue, saleValue, grossMargin, netPayable, supplier:Supplier(id,name), customer:Customer(id,name), commodity:Commodity(id,name)'
    )
    if (from) query = query.gte('deliveryDate', from)
    if (to) query = query.lte('deliveryDate', to)
    if (commodityId) query = query.eq('commodityId', commodityId)
    const { data: deliveries } = await query.order('deliveryDate', { ascending: false })

    const totalPurchase = (deliveries || []).reduce((s: number, d: any) => s + Number(d.purchaseValue ?? 0), 0)
    const totalSale = (deliveries || []).reduce((s: number, d: any) => s + Number(d.saleValue ?? 0), 0)
    const totalMargin = (deliveries || []).reduce((s: number, d: any) => s + Number(d.grossMargin ?? 0), 0)
    const totalWeight = (deliveries || []).reduce((s: number, d: any) => s + Number(d.adjustedWeight ?? 0), 0)
    return json({ deliveries, totalPurchase, totalSale, totalMargin, totalWeight })
  }

  // ── GET /reports/supplier ──────────────────────────────────────────────────
  // Summary per supplier: deliveries, weight, purchase value, paid, outstanding
  if (req.method === 'GET' && report === 'supplier') {
    const from = url.searchParams.get('from')
    const to = url.searchParams.get('to')
    const supplierId = url.searchParams.get('supplierId')

    let dQuery = db.from('Delivery').select('supplierId, adjustedWeight, purchaseValue, netPayable, deliveryDate, supplier:Supplier(id,name)')
    if (from) dQuery = dQuery.gte('deliveryDate', from)
    if (to) dQuery = dQuery.lte('deliveryDate', to)
    if (supplierId) dQuery = dQuery.eq('supplierId', supplierId)
    else dQuery = dQuery.not('supplierId', 'is', null)

    const [{ data: deliveries }, { data: allPayments }] = await Promise.all([
      dQuery,
      db.from('SupplierPayment').select('supplierId, amount, paymentDate, paymentNumber, supplier:Supplier(id,name)'),
    ])

    const bySupplier: Record<string, any> = {}
    for (const d of (deliveries || [])) {
      const sid = d.supplierId
      if (!sid) continue
      if (!bySupplier[sid]) bySupplier[sid] = { supplierId: sid, name: d.supplier?.name ?? sid, deliveryCount: 0, totalWeight: 0, totalPurchaseValue: 0, totalNetPayable: 0, totalPaid: 0 }
      bySupplier[sid].deliveryCount++
      bySupplier[sid].totalWeight += Number(d.adjustedWeight ?? 0)
      const pv = Number(d.purchaseValue ?? 0)
      bySupplier[sid].totalPurchaseValue += pv
      // Use stored netPayable if available, otherwise fall back to purchaseValue
      bySupplier[sid].totalNetPayable += d.netPayable != null ? Number(d.netPayable) : pv
    }

    const filteredPayments = supplierId
      ? (allPayments || []).filter((p: any) => p.supplierId === supplierId)
      : (allPayments || [])
    for (const p of filteredPayments) {
      if (bySupplier[p.supplierId]) bySupplier[p.supplierId].totalPaid += Number(p.amount)
    }

    const rows = Object.values(bySupplier).map((r: any) => ({
      ...r,
      outstanding: r.totalNetPayable - r.totalPaid,
    })).sort((a: any, b: any) => b.totalPurchaseValue - a.totalPurchaseValue)

    // If drilling into a single supplier, also return payment history
    let paymentHistory = null
    if (supplierId) {
      const { data: ph } = await db.from('SupplierPayment')
        .select('id, paymentNumber, amount, paymentDate, notes, supplier:Supplier(id,name)')
        .eq('supplierId', supplierId)
        .order('paymentDate', { ascending: false })
      paymentHistory = ph
    }

    return json({ rows, paymentHistory })
  }

  // ── GET /reports/customer ──────────────────────────────────────────────────
  if (req.method === 'GET' && report === 'customer') {
    const from = url.searchParams.get('from')
    const to = url.searchParams.get('to')
    const customerId = url.searchParams.get('customerId')

    let dQuery = db.from('Delivery').select('customerId, adjustedWeight, saleRate, saleValue, grossMargin, deliveryDate, customer:Customer(id,name)')
    if (from) dQuery = dQuery.gte('deliveryDate', from)
    if (to) dQuery = dQuery.lte('deliveryDate', to)
    if (customerId) dQuery = dQuery.eq('customerId', customerId)
    else dQuery = dQuery.not('customerId', 'is', null)

    const [{ data: deliveries }, { data: allReceipts }] = await Promise.all([
      dQuery,
      db.from('CustomerReceipt').select('customerId, amount, receiptDate, receiptNumber, customer:Customer(id,name)'),
    ])

    const byCustomer: Record<string, any> = {}
    for (const d of (deliveries || [])) {
      const cid = d.customerId
      if (!cid) continue
      if (!byCustomer[cid]) byCustomer[cid] = { customerId: cid, name: d.customer?.name ?? cid, deliveryCount: 0, totalWeight: 0, totalSaleValue: 0, totalGrossSale: 0, totalMargin: 0, totalReceived: 0 }
      byCustomer[cid].deliveryCount++
      byCustomer[cid].totalWeight += Number(d.adjustedWeight ?? 0)
      byCustomer[cid].totalSaleValue += Number(d.saleValue ?? 0)
      byCustomer[cid].totalGrossSale += Number(d.adjustedWeight ?? 0) * Number(d.saleRate ?? 0)
      byCustomer[cid].totalMargin += Number(d.grossMargin ?? 0)
    }

    const filteredReceipts = customerId ? (allReceipts || []).filter((r: any) => r.customerId === customerId) : (allReceipts || [])
    for (const r of filteredReceipts) {
      if (byCustomer[r.customerId]) byCustomer[r.customerId].totalReceived += Number(r.amount)
    }

    const rows = Object.values(byCustomer).map((r: any) => ({
      ...r,
      // Outstanding is measured against the gross invoiced amount, not net realisation.
      outstanding: r.totalGrossSale - r.totalReceived,
    })).sort((a: any, b: any) => b.totalSaleValue - a.totalSaleValue)

    let receiptHistory = null
    if (customerId) {
      const { data: rh } = await db.from('CustomerReceipt')
        .select('id, receiptNumber, amount, receiptDate, notes, customer:Customer(id,name)')
        .eq('customerId', customerId)
        .order('receiptDate', { ascending: false })
      receiptHistory = rh
    }

    return json({ rows, receiptHistory })
  }

  // ── GET /reports/payments ──────────────────────────────────────────────────
  // All payment/receipt transactions with date filter
  if (req.method === 'GET' && report === 'payments') {
    const from = url.searchParams.get('from')
    const to = url.searchParams.get('to')

    let spQuery = db.from('SupplierPayment').select('id, paymentNumber, amount, paymentDate, notes, supplierId, supplier:Supplier(id,name)')
    let crQuery = db.from('CustomerReceipt').select('id, receiptNumber, amount, receiptDate, notes, customerId, customer:Customer(id,name)')
    if (from) { spQuery = spQuery.gte('paymentDate', from); crQuery = crQuery.gte('receiptDate', from) }
    if (to) { spQuery = spQuery.lte('paymentDate', to); crQuery = crQuery.lte('receiptDate', to) }

    const [{ data: payments }, { data: receipts }] = await Promise.all([
      spQuery.order('paymentDate', { ascending: false }),
      crQuery.order('receiptDate', { ascending: false }),
    ])

    const totalPaid = (payments || []).reduce((s: number, p: any) => s + Number(p.amount), 0)
    const totalReceived = (receipts || []).reduce((s: number, r: any) => s + Number(r.amount), 0)

    // Net cash flow per day
    const dailyMap: Record<string, { date: string; paid: number; received: number }> = {}
    for (const p of (payments || [])) {
      const d = p.paymentDate?.split('T')[0]
      if (!dailyMap[d]) dailyMap[d] = { date: d, paid: 0, received: 0 }
      dailyMap[d].paid += Number(p.amount)
    }
    for (const r of (receipts || [])) {
      const d = r.receiptDate?.split('T')[0]
      if (!dailyMap[d]) dailyMap[d] = { date: d, paid: 0, received: 0 }
      dailyMap[d].received += Number(r.amount)
    }
    const dailyCashFlow = Object.values(dailyMap).sort((a, b) => b.date.localeCompare(a.date))

    return json({ payments, receipts, totalPaid, totalReceived, netCashFlow: totalReceived - totalPaid, dailyCashFlow })
  }

  // ── GET /reports/stock ─────────────────────────────────────────────────────
  if (req.method === 'GET' && report === 'stock') {
    const { data: deliveries } = await db.from('Delivery')
      .select('adjustedWeight, purchaseValue, saleValue, commodity:Commodity(id,name)')
    const byComm: Record<string, any> = {}
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
