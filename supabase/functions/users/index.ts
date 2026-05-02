import { corsResponse, json, error } from '../_shared/cors.ts'
import { requireAuth, requireRole, getAdminClient } from '../_shared/auth.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsResponse()

  const { user, response: authResponse } = await requireAuth(req)
  if (authResponse) return authResponse

  const roleCheck = requireRole(user.role, 'ADMIN')
  if (roleCheck) return roleCheck

  const db = getAdminClient()
  const url = new URL(req.url)
  const id = url.pathname.split('/').pop()
  const isId = id && id !== 'users'

  // GET /users
  if (req.method === 'GET' && !isId) {
    const { data } = await db.from('User').select('id, name, email, role, isActive, createdAt').order('name')
    return json(data)
  }

  // POST /users
  if (req.method === 'POST') {
    const body = await req.json()
    const { name, email, password, role = 'OPERATIONS' } = body
    if (!name || !email || !password) return error('name, email, password required')

    // Create Supabase Auth user
    const { data: authData, error: authErr } = await db.auth.admin.createUser({
      email, password, email_confirm: true,
    })
    if (authErr) return error(authErr.message)

    const { data: newUser, error: dbErr } = await db
      .from('User')
      .insert({ name, email, role, password: 'managed-by-supabase-auth' })
      .select('id, name, email, role, isActive')
      .single()
    if (dbErr) return error(dbErr.message)
    return json(newUser, 201)
  }

  // PUT /users/:id
  if (req.method === 'PUT' && isId) {
    const body = await req.json()
    const updates: Record<string, unknown> = {}
    if (body.name) updates.name = body.name
    if (body.role) updates.role = body.role
    if (typeof body.isActive === 'boolean') updates.isActive = body.isActive
    if (body.password) {
      const { data: existing } = await db.from('User').select('email').eq('id', id).single()
      if (existing) {
        const { data: authUsers } = await db.auth.admin.listUsers()
        const authUser = authUsers?.users.find((u: any) => u.email === existing.email)
        if (authUser) await db.auth.admin.updateUserById(authUser.id, { password: body.password })
      }
    }
    const { data, error: dbErr } = await db.from('User').update(updates).eq('id', id!).select('id, name, email, role, isActive').single()
    if (dbErr) return error(dbErr.message)
    return json(data)
  }

  // DELETE /users/:id
  if (req.method === 'DELETE' && isId) {
    const { data: existing } = await db.from('User').select('email').eq('id', id).single()
    if (existing?.email === 'admin@akshayaagri.com') return error('Cannot delete the primary admin account')
    await db.from('User').update({ isActive: false }).eq('id', id!)
    return json({ success: true })
  }

  return error('Not found', 404)
})
