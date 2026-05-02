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
  const last = parts[parts.length - 1]
  const secondLast = parts[parts.length - 2]

  // PATCH /purchase-orders/:id/status
  if (req.method === 'PATCH' && last === 'status') {
    const id = secondLast
    const { status } = await req.json()
    const { data, error: dbErr } = await db.from('PurchaseOrder').update({ status }).eq('id', id).select().single()
    if (dbErr) return error(dbErr.message)
    return json(data)
  }

  const id = last !== 'purchase-orders' ? last : null

  // GET /purchase-orders
  if (req.method === 'GET' && !id) {
    const supplierId = url.searchParams.get('supplierId')
    const status = url.searchParams.get('status')
    let query = db.from('PurchaseOrder')
      .select('*, supplier:Supplier(*), commodity:Commodity(*)')
      .order('orderDate', { ascending: false })
    if (supplierId) query = query.eq('supplierId', supplierId)
    if (status) query = query.eq('status', status)
    const { data } = await query
    return json(data)
  }

  // GET /purchase-orders/:id
  if (req.method === 'GET' && id) {
    const { data } = await db.from('PurchaseOrder')
      .select('*, supplier:Supplier(*), commodity:Commodity(*), deliveries:Delivery(*)')
      .eq('id', id).single()
    return json(data)
  }

  // POST /purchase-orders
  if (req.method === 'POST') {
    const body = await req.json()
    const poNumber = await getNextNumber(db, 'PO')
    const { data, error: dbErr } = await db.from('PurchaseOrder')
      .insert({ ...body, poNumber, status: 'CONFIRMED' })
      .select('*, supplier:Supplier(*), commodity:Commodity(*)')
      .single()
    if (dbErr) return error(dbErr.message)
    return json(data, 201)
  }

  // PUT /purchase-orders/:id
  if (req.method === 'PUT' && id) {
    const body = await req.json()
    const { data, error: dbErr } = await db.from('PurchaseOrder').update(body).eq('id', id)
      .select('*, supplier:Supplier(*), commodity:Commodity(*)')
      .single()
    if (dbErr) return error(dbErr.message)
    return json(data)
  }

  // DELETE /purchase-orders/:id
  if (req.method === 'DELETE' && id) {
    const roleCheck = requireRole(user.role, 'ADMIN')
    if (roleCheck) return roleCheck
    const { data: deliveries } = await db.from('Delivery').select('id').eq('purchaseOrderId', id).limit(1)
    if (deliveries && deliveries.length > 0) return error('Cannot cancel a purchase order that has deliveries')
    const { data, error: dbErr } = await db.from('PurchaseOrder').update({ status: 'CANCELLED' }).eq('id', id).select().single()
    if (dbErr) return error(dbErr.message)
    return json(data)
  }

  return error('Not found', 404)
})
