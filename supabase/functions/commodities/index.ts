import { corsResponse, json, error } from '../_shared/cors.ts'
import { requireAuth, requireRole, getAdminClient } from '../_shared/auth.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsResponse()

  const { user, response: authResponse } = await requireAuth(req)
  if (authResponse) return authResponse

  const db = getAdminClient()
  const url = new URL(req.url)
  const parts = url.pathname.split('/').filter(Boolean)
  const id = parts[parts.length - 1] !== 'commodities' ? parts[parts.length - 1] : null

  // GET /commodities
  if (req.method === 'GET') {
    const { data } = await db.from('Commodity').select('*').eq('isActive', true).order('name')
    return json(data)
  }

  // POST /commodities
  if (req.method === 'POST') {
    const body = await req.json()
    const now = new Date().toISOString()
    const { data, error: dbErr } = await db.from('Commodity').insert({ ...body, id: crypto.randomUUID(), createdAt: now, updatedAt: now }).select().single()
    if (dbErr) return error(dbErr.message)
    return json(data, 201)
  }

  // PUT /commodities/:id
  if (req.method === 'PUT' && id) {
    const body = await req.json()
    const { data, error: dbErr } = await db.from('Commodity').update(body).eq('id', id).select().single()
    if (dbErr) return error(dbErr.message)
    return json(data)
  }

  // DELETE /commodities/:id
  if (req.method === 'DELETE' && id) {
    const roleCheck = requireRole(user.role, 'ADMIN')
    if (roleCheck) return roleCheck
    const { data: inUse } = await db.from('PurchaseOrder').select('id').eq('commodityId', id).limit(1)
    if (inUse && inUse.length > 0) return error('Commodity is linked to existing orders and cannot be deleted')
    await db.from('Commodity').update({ isActive: false }).eq('id', id)
    return json({ success: true })
  }

  return error('Not found', 404)
})
