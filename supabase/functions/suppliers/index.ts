import { corsResponse, json, error } from '../_shared/cors.ts'
import { requireAuth, getAdminClient } from '../_shared/auth.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsResponse()

  const { user, response: authResponse } = await requireAuth(req)
  if (authResponse) return authResponse

  const db = getAdminClient()
  const url = new URL(req.url)
  const parts = url.pathname.split('/').filter(Boolean)
  const id = parts[parts.length - 1] !== 'suppliers' && parts[parts.length - 1] !== 'all' ? parts[parts.length - 1] : null
  const isAll = parts.includes('all')

  // GET /suppliers/all
  if (req.method === 'GET' && isAll) {
    const { data } = await db.from('Supplier').select('*').order('name')
    return json(data)
  }

  // GET /suppliers
  if (req.method === 'GET' && !id) {
    const search = url.searchParams.get('search')
    let query = db.from('Supplier').select('*').eq('isActive', true).order('name')
    if (search) query = query.ilike('name', `%${search}%`)
    const { data } = await query
    return json(data)
  }

  // GET /suppliers/:id
  if (req.method === 'GET' && id) {
    const { data } = await db.from('Supplier').select('*').eq('id', id).single()
    return json(data)
  }

  // POST /suppliers
  if (req.method === 'POST') {
    const body = await req.json()
    const { data, error: dbErr } = await db.from('Supplier').insert(body).select().single()
    if (dbErr) return error(dbErr.message)
    return json(data, 201)
  }

  // PUT /suppliers/:id
  if (req.method === 'PUT' && id) {
    const body = await req.json()
    const { data, error: dbErr } = await db.from('Supplier').update(body).eq('id', id).select().single()
    if (dbErr) return error(dbErr.message)
    return json(data)
  }

  // DELETE /suppliers/:id
  if (req.method === 'DELETE' && id) {
    await db.from('Supplier').update({ isActive: false }).eq('id', id)
    return json({ success: true })
  }

  return error('Not found', 404)
})
