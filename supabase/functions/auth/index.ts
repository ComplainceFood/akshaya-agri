import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders, corsResponse, json, error } from '../_shared/cors.ts'
import { getAdminClient } from '../_shared/auth.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsResponse()

  const url = new URL(req.url)
  const path = url.pathname.replace(/^\/auth/, '')

  // POST /auth/login
  if (req.method === 'POST' && path === '/login') {
    const { email, password } = await req.json()
    if (!email || !password) return error('Email and password required')

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!
    )

    const { data, error: authError } = await supabase.auth.signInWithPassword({ email, password })
    if (authError || !data.user) return error('Invalid credentials', 401)

    const db = getAdminClient()
    const { data: profile } = await db
      .from('User')
      .select('id, name, email, role, isActive')
      .eq('email', email)
      .single()

    if (!profile || !profile.isActive) return error('Account is inactive', 401)

    return json({ token: data.session!.access_token, user: profile })
  }

  // GET /auth/me
  if (req.method === 'GET' && path === '/me') {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return error('Unauthorized', 401)

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    )

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return error('Unauthorized', 401)

    const db = getAdminClient()
    const { data: profile } = await db
      .from('User')
      .select('id, name, email, role, isActive')
      .eq('email', user.email!)
      .single()

    return json(profile)
  }

  return error('Not found', 404)
})
