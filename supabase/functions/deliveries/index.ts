import { corsResponse, json, error } from '../_shared/cors.ts'
import { requireAuth, requireRole, getAdminClient } from '../_shared/auth.ts'
import { getNextNumber } from '../_shared/sequence.ts'

const MC_THRESHOLD_PCT = 14
const CESS_RATE = 0.01

function calcDelivery(data: {
  grossWeight?: number; tareWeight?: number
  qualityDeductionPct?: number; purchaseRate?: number; saleRate?: number; cessRate?: number
  moisturePct?: number; cessApplicable?: boolean; cessPaid?: number
}) {
  // cessApplicable now comes from the Commodity (not the Delivery row); callers must
  // resolve and pass it in. Treat missing as true (default for commodities).
  const gross = Number(data.grossWeight ?? 0)
  const tare = Number(data.tareWeight ?? 0)
  const qd = Number(data.qualityDeductionPct ?? 0)
  const netWeight = gross - tare
  const adjustedWeight = netWeight * (1 - qd / 100)
  const purchaseValue = data.purchaseRate ? adjustedWeight * Number(data.purchaseRate) : null
  // Gross sale = adjusted weight × sale rate (this is what the customer is invoiced).
  const grossSaleValue = data.saleRate ? adjustedWeight * Number(data.saleRate) : null

  const mc = Number(data.moisturePct ?? 0)
  // MC deduction is applied on the gross sale; same amount is passed through to supplier on netPayable.
  const mcDeduction = grossSaleValue !== null && mc > MC_THRESHOLD_PCT
    ? ((mc - MC_THRESHOLD_PCT) / 100) * grossSaleValue
    : 0
  const cessPaid = Number(data.cessPaid ?? 0)
  // Two separate cess terms (both deducted symmetrically from saleValue and netPayable):
  //   cessOnSale  = 1% × adjustedWeight × COALESCE(cessRate, saleRate)  (when commodity has cess)
  //                = 0                                                   (when commodity has no cess)
  //   balanceCess = −cessPaid  (always; we refund any supplier-paid cess regardless of commodity flag)
  const cessRateVal = data.cessRate ? Number(data.cessRate) : (data.saleRate ? Number(data.saleRate) : null)
  const cessBaseValue = cessRateVal ? adjustedWeight * cessRateVal : null
  const cessOnSale = cessBaseValue !== null
    ? (data.cessApplicable ? cessBaseValue * CESS_RATE : 0)
    : null
  const balanceCess = -cessPaid
  // Stored saleValue = net realisation (gross − MC − cessOnSale − balanceCess).
  const saleValue = grossSaleValue !== null && cessOnSale !== null
    ? grossSaleValue - mcDeduction - cessOnSale - balanceCess
    : null
  // Supplier payout: MC is pass-through; balanceCess is the refund. cessOnSale (E1)
  // is what the customer deducts from us and is NOT recovered from the supplier.
  const netPayable = purchaseValue !== null
    ? purchaseValue - mcDeduction - balanceCess
    : null
  // Margin = saleValue − netPayable = (grossSale − grossPurchase) − cessOnSale.
  const grossMargin = saleValue !== null && netPayable !== null
    ? saleValue - netPayable
    : null

  return { netWeight, adjustedWeight, purchaseValue, saleValue, grossMargin, netPayable, balanceCess, cessOnSale }
}

async function fetchCessRate(db: any, deliveryDate: string | null | undefined, commodityId: string | null | undefined): Promise<number | null> {
  if (!deliveryDate || !commodityId) return null
  const { data } = await db.from('DailySaleRate')
    .select('ratePerQuintal')
    .eq('rateDate', deliveryDate)
    .eq('commodityId', commodityId)
    .maybeSingle()
  return data?.ratePerQuintal ? Number(data.ratePerQuintal) : null
}

async function fetchCommodityCessApplicable(db: any, commodityId: string | null | undefined): Promise<boolean> {
  if (!commodityId) return true
  const { data } = await db.from('Commodity')
    .select('cessApplicable')
    .eq('id', commodityId)
    .maybeSingle()
  return data?.cessApplicable ?? true
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
      .select('*, supplier:Supplier(id,name), customer:Customer(id,name)')
      .order('lrNumber', { ascending: true, nullsFirst: false })
    if (supplierId) query = query.eq('supplierId', supplierId)
    if (customerId) query = query.eq('customerId', customerId)
    if (from) query = query.gte('deliveryDate', from)
    if (to) query = query.lte('deliveryDate', to)
    const { data: deliveries } = await query

    // Enrich with commodity manually (PostgREST FK join unreliable for text PKs)
    const commodityIds = [...new Set((deliveries || []).map((d: any) => d.commodityId).filter(Boolean))]
    let commodityMap: Record<string, any> = {}
    if (commodityIds.length > 0) {
      const { data: comms } = await db.from('Commodity').select('id,name,cessApplicable').in('id', commodityIds)
      for (const c of (comms || [])) commodityMap[c.id] = c
    }
    const enriched = (deliveries || []).map((d: any) => ({
      ...d,
      commodity: d.commodityId ? (commodityMap[d.commodityId] ?? null) : null,
    }))
    return json(enriched)
  }

  // GET /deliveries/:id
  if (req.method === 'GET' && id) {
    const { data } = await db.from('Delivery')
      .select('*, supplier:Supplier(*), customer:Customer(*), commodity:Commodity(id,name,cessApplicable), supplierPaymentAllocations:SupplierPaymentAllocation(*, payment:SupplierPayment(*)), customerReceiptAllocations:CustomerReceiptAllocation(*, receipt:CustomerReceipt(*))')
      .eq('id', id).single()
    return json(data)
  }

  // POST /deliveries
  if (req.method === 'POST') {
    const body = await req.json()
    // cessApplicable now lives on the Commodity; ignore any value in the request body.
    const { cessApplicable: _ignore, ...insertBody } = body
    const cessRate = await fetchCessRate(db, body.deliveryDate, body.commodityId)
    const cessApplicable = await fetchCommodityCessApplicable(db, body.commodityId)
    const deliveryNumber = await getNextNumber(db, 'LR')
    const calc = calcDelivery({ ...insertBody, cessRate, cessApplicable })
    const now = new Date().toISOString()
    const { data, error: dbErr } = await db.from('Delivery')
      .insert({ ...insertBody, id: crypto.randomUUID(), deliveryNumber, ...calc, cessRate, createdAt: now, updatedAt: now })
      .select('*, supplier:Supplier(id,name), customer:Customer(id,name), commodity:Commodity(id,name,cessApplicable)')
      .single()
    if (dbErr) return error(dbErr.message)
    return json(data, 201)
  }

  // PUT /deliveries/:id
  if (req.method === 'PUT' && id) {
    const body = await req.json()
    // cessApplicable now lives on the Commodity; ignore any value in the request body.
    const { cessApplicable: _ignore, ...updateBody } = body
    const { data: existing } = await db.from('Delivery').select('*').eq('id', id).single()
    if (!existing) return error('Delivery not found', 404)
    const merged = { ...existing, ...updateBody }
    const cessRate = await fetchCessRate(db, merged.deliveryDate, merged.commodityId)
    const cessApplicable = await fetchCommodityCessApplicable(db, merged.commodityId)
    const calc = calcDelivery({
      grossWeight: Number(merged.grossWeight), tareWeight: Number(merged.tareWeight),
      qualityDeductionPct: Number(merged.qualityDeductionPct ?? 0),
      purchaseRate: merged.purchaseRate ? Number(merged.purchaseRate) : undefined,
      saleRate: merged.saleRate ? Number(merged.saleRate) : undefined,
      cessRate: cessRate ?? undefined,
      moisturePct: Number(merged.moisturePct ?? 0),
      cessApplicable,
      cessPaid: Number(merged.cessPaid ?? 0),
    })
    const { data, error: dbErr } = await db.from('Delivery').update({ ...updateBody, ...calc, cessRate, updatedAt: new Date().toISOString() }).eq('id', id)
      .select('*, supplier:Supplier(id,name), customer:Customer(id,name), commodity:Commodity(id,name,cessApplicable)')
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
    const { data: invoiceItems } = await db.from('InvoiceItem').select('id').eq('deliveryId', id).limit(1)
    if ((allocs && allocs.length > 0) || (recAllocs && recAllocs.length > 0)) {
      return error('Cannot delete a delivery that has payment allocations')
    }
    if (invoiceItems && invoiceItems.length > 0) {
      return error('Cannot delete a delivery that has been invoiced. Delete the invoice first.')
    }
    await db.from('Delivery').delete().eq('id', id)
    return json({ success: true })
  }

  return error('Not found', 404)
})
