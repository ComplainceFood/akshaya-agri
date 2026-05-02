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

  // PATCH /sales-orders/:id/status
  if (req.method === 'PATCH' && last === 'status') {
    const id = secondLast
    const { status } = await req.json()
    const { data, error: dbErr } = await db.from('SalesOrder').update({ status }).eq('id', id).select().single()
    if (dbErr) return error(dbErr.message)
    return json(data)
  }

  const id = last !== 'sales-orders' ? last : null

  // GET /sales-orders
  if (req.method === 'GET' && !id) {
    const customerId = url.searchParams.get('customerId')
    const status = url.searchParams.get('status')
    let query = db.from('SalesOrder')
      .select('*, customer:Customer(*), commodity:Commodity(*)')
      .order('orderDate', { ascending: false })
    if (customerId) query = query.eq('customerId', customerId)
    if (status) query = query.eq('status', status)
    const { data } = await query
    return json(data)
  }

  // GET /sales-orders/:id
  if (req.method === 'GET' && id) {
    const { data } = await db.from('SalesOrder')
      .select('*, customer:Customer(*), commodity:Commodity(*), deliveries:Delivery(*)')
      .eq('id', id).single()
    return json(data)
  }

  // POST /sales-orders
  if (req.method === 'POST') {
    const body = await req.json()
    const soNumber = await getNextNumber(db, 'SO')
    const now = new Date().toISOString()
    const { data, error: dbErr } = await db.from('SalesOrder')
      .insert({ ...body, id: crypto.randomUUID(), soNumber, status: 'CONFIRMED', createdAt: now, updatedAt: now })
      .select('*, customer:Customer(*), commodity:Commodity(*)')
      .single()
    if (dbErr) return error(dbErr.message)
    return json(data, 201)
  }

  // PUT /sales-orders/:id
  if (req.method === 'PUT' && id) {
    const body = await req.json()
    const { data, error: dbErr } = await db.from('SalesOrder').update(body).eq('id', id)
      .select('*, customer:Customer(*), commodity:Commodity(*)')
      .single()
    if (dbErr) return error(dbErr.message)
    return json(data)
  }

  // DELETE /sales-orders/:id
  if (req.method === 'DELETE' && id) {
    const roleCheck = requireRole(user.role, 'ADMIN')
    if (roleCheck) return roleCheck
    const { data: deliveries } = await db.from('Delivery').select('id').eq('salesOrderId', id).limit(1)
    if (deliveries && deliveries.length > 0) return error('Cannot cancel a sales order that has deliveries')
    const { data, error: dbErr } = await db.from('SalesOrder').update({ status: 'CANCELLED' }).eq('id', id).select().single()
    if (dbErr) return error(dbErr.message)
    return json(data)
  }

  return error('Not found', 404)
})
