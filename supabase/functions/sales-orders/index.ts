import { corsResponse, json, error } from '../_shared/cors.ts'
import { requireAuth, getAdminClient } from '../_shared/auth.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsResponse()

  const { response: authResponse } = await requireAuth(req)
  if (authResponse) return authResponse

  const db = getAdminClient()
  const url = new URL(req.url)
  const parts = url.pathname.split('/').filter(Boolean)
  const last = parts[parts.length - 1]
  const id = last !== 'sales-orders' ? last : null

  // GET /sales-orders?date=YYYY-MM-DD&commodityId=xxx
  if (req.method === 'GET' && !id) {
    const date = url.searchParams.get('date')
    const commodityId = url.searchParams.get('commodityId')
    let query = db.from('DailySaleRate')
      .select('*, commodity:Commodity(id,name)')
      .order('rateDate', { ascending: false })
    if (date) query = query.eq('rateDate', date)
    if (commodityId) query = query.eq('commodityId', commodityId)
    const { data } = await query
    return json(data)
  }

  // GET /sales-orders/:id
  if (req.method === 'GET' && id) {
    const { data } = await db.from('DailySaleRate')
      .select('*, commodity:Commodity(id,name)')
      .eq('id', id).single()
    return json(data)
  }

  // POST - insert or update if same rateDate+commodityId already exists
  if (req.method === 'POST') {
    const body = await req.json()
    const { rateDate, commodityId, ratePerQuintal, notes } = body
    const { data: existing } = await db.from('DailySaleRate')
      .select('id').eq('rateDate', rateDate).eq('commodityId', commodityId).maybeSingle()
    let data, dbErr
    if (existing) {
      ;({ data, error: dbErr } = await db.from('DailySaleRate')
        .update({ ratePerQuintal, notes })
        .eq('id', existing.id)
        .select('*, commodity:Commodity(id,name)').single())
    } else {
      ;({ data, error: dbErr } = await db.from('DailySaleRate')
        .insert({ id: crypto.randomUUID(), rateDate, commodityId, ratePerQuintal, notes })
        .select('*, commodity:Commodity(id,name)').single())
    }
    if (dbErr) return error(dbErr.message)
    return json(data, 201)
  }

  // PUT /sales-orders/:id
  if (req.method === 'PUT' && id) {
    const { rateDate, commodityId, ratePerQuintal, notes } = await req.json()
    const { data, error: dbErr } = await db.from('DailySaleRate')
      .update({ rateDate, commodityId, ratePerQuintal, notes }).eq('id', id)
      .select('*, commodity:Commodity(id,name)').single()
    if (dbErr) return error(dbErr.message)
    return json(data)
  }

  // DELETE /sales-orders/:id
  if (req.method === 'DELETE' && id) {
    const { error: dbErr } = await db.from('DailySaleRate').delete().eq('id', id)
    if (dbErr) return error(dbErr.message)
    return json({ success: true })
  }

  return error('Not found', 404)
})
