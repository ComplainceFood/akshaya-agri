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
  const id = last !== 'purchase-orders' ? last : null

  // GET /purchase-orders?date=YYYY-MM-DD&commodityId=xxx
  if (req.method === 'GET' && !id) {
    const date = url.searchParams.get('date')
    const commodityId = url.searchParams.get('commodityId')
    let query = db.from('DailyPurchaseRate')
      .select('*, commodity:Commodity(id,name)')
      .order('rateDate', { ascending: false })
    if (date) query = query.eq('rateDate', date)
    if (commodityId) query = query.eq('commodityId', commodityId)
    const { data } = await query
    return json(data)
  }

  // GET /purchase-orders/:id
  if (req.method === 'GET' && id) {
    const { data } = await db.from('DailyPurchaseRate')
      .select('*, commodity:Commodity(id,name)')
      .eq('id', id).single()
    return json(data)
  }

  // POST - upsert so setting rate twice on same day just updates
  if (req.method === 'POST') {
    const body = await req.json()
    const now = new Date().toISOString()
    const { data, error: dbErr } = await db.from('DailyPurchaseRate')
      .upsert(
        { ...body, id: body.id ?? crypto.randomUUID(), updatedAt: now },
        { onConflict: 'rateDate,commodityId', ignoreDuplicates: false }
      )
      .select('*, commodity:Commodity(id,name)')
      .single()
    if (dbErr) return error(dbErr.message)
    return json(data, 201)
  }

  // PUT /purchase-orders/:id
  if (req.method === 'PUT' && id) {
    const body = await req.json()
    const { data, error: dbErr } = await db.from('DailyPurchaseRate')
      .update({ ...body, updatedAt: new Date().toISOString() }).eq('id', id)
      .select('*, commodity:Commodity(id,name)')
      .single()
    if (dbErr) return error(dbErr.message)
    return json(data)
  }

  // DELETE /purchase-orders/:id
  if (req.method === 'DELETE' && id) {
    const { error: dbErr } = await db.from('DailyPurchaseRate').delete().eq('id', id)
    if (dbErr) return error(dbErr.message)
    return json({ success: true })
  }

  return error('Not found', 404)
})
