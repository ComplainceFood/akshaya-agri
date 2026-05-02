import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { error } from './cors.ts'

export async function requireAuth(req: Request) {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return { user: null, response: error('Unauthorized', 401) }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } }
  )

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return { user: null, response: error('Unauthorized', 401) }

  // Get role from our users table
  const adminClient = getAdminClient()
  const { data: profile } = await adminClient
    .from('User')
    .select('id, name, email, role, isActive')
    .eq('email', user.email!)
    .single()

  if (!profile || !profile.isActive) return { user: null, response: error('Unauthorized', 401) }

  return { user: profile, response: null }
}

export function requireRole(userRole: string, ...roles: string[]) {
  if (!roles.includes(userRole)) return error('Forbidden: insufficient permissions', 403)
  return null
}

export function getAdminClient() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )
}
