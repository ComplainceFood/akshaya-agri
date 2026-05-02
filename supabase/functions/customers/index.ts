import { corsResponse, json, error } from '../_shared/cors.ts'
import { requireAuth, getAdminClient } from '../_shared/auth.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsResponse()

  const { user, response: authResponse } = await requireAuth(req)
  if (authResponse) return authResponse

  const db = getAdminClient()
  const url = new URL(req.url)
  const parts = url.pathname.split('/').filter(Boolean)
  const id = parts[parts.length - 1] !== 'customers' ? parts[parts.length - 1] : null

  // GET /customers
  if (req.method === 'GET' && !id) {
    const { data } = await db.from('Customer').select('*').eq('isActive', true).order('name')
    return json(data)
  }

  // GET /customers/:id
  if (req.method === 'GET' && id) {
    const { data } = await db.from('Customer').select('*').eq('id', id).single()
    return json(data)
  }

  // POST /customers
  if (req.method === 'POST') {
    const body = await req.json()
    const { data, error: dbErr } = await db.from('Customer').insert(body).select().single()
    if (dbErr) return error(dbErr.message)
    return json(data, 201)
  }

  // PUT /customers/:id
  if (req.method === 'PUT' && id) {
    const body = await req.json()
    const { data, error: dbErr } = await db.from('Customer').update(body).eq('id', id).select().single()
    if (dbErr) return error(dbErr.message)
    return json(data)
  }

  // DELETE /customers/:id
  if (req.method === 'DELETE' && id) {
    await db.from('Customer').update({ isActive: false }).eq('id', id)
    return json({ success: true })
  }

  return error('Not found', 404)
})
