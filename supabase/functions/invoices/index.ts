import { corsResponse, json, error } from '../_shared/cors.ts'
import { requireAuth, getAdminClient } from '../_shared/auth.ts'
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

  // POST /invoices/preview  — group deliveries into draft invoices (no DB write)
  if (req.method === 'POST' && last === 'preview') {
    const { from, to, customerIds } = await req.json()
    let query = db.from('Delivery')
      .select('*, customer:Customer(id,name,email,gstNumber,billingAddress,billingVillage,billingDistrict,billingState), commodity:Commodity(id,name,hsnCode)')
      .not('customerId', 'is', null)
      .not('saleValue', 'is', null)
      .order('deliveryDate', { ascending: true })
    if (from) query = query.gte('deliveryDate', from)
    if (to) query = query.lte('deliveryDate', to)
    if (customerIds?.length) query = query.in('customerId', customerIds)

    const { data: deliveries, error: dbErr } = await query
    if (dbErr) return error(dbErr.message)

    // Group by customerId + deliveryDate + commodityId (same-day same-commodity = one invoice)
    const groups: Record<string, any> = {}
    for (const d of (deliveries || [])) {
      const dateStr = d.deliveryDate?.split('T')[0] ?? d.deliveryDate
      const key = `${d.customerId}||${dateStr}||${d.commodityId}`
      if (!groups[key]) {
        groups[key] = {
          key,
          customerId: d.customerId,
          customer: d.customer,
          deliveryDate: dateStr,
          commodityId: d.commodityId,
          commodity: d.commodity,
          deliveries: [],
          totalWeight: 0,
          totalSaleValue: 0,
          saleRate: d.saleRate,
        }
      }
      groups[key].deliveries.push(d)
      groups[key].totalWeight += Number(d.adjustedWeight ?? 0)
      groups[key].totalSaleValue += Number(d.saleValue ?? 0)
    }

    return json(Object.values(groups))
  }

  // POST /invoices/generate  — create Invoice + InvoiceItem rows for selected groups
  if (req.method === 'POST' && last === 'generate') {
    const { groups } = await req.json()  // array of preview groups
    const created = []
    for (const g of groups) {
      const invoiceNumber = await getNextNumber(db, 'INV')
      const now = new Date().toISOString()
      const { data: inv, error: invErr } = await db.from('Invoice').insert({
        id: crypto.randomUUID(),
        invoiceNumber,
        customerId: g.customerId,
        commodityId: g.commodityId,
        invoiceDate: g.deliveryDate,
        totalWeight: g.totalWeight,
        totalAmount: g.totalSaleValue,
        status: 'DRAFT',
        createdAt: now,
        updatedAt: now,
      }).select().single()
      if (invErr) return error(invErr.message)

      for (const d of g.deliveries) {
        await db.from('InvoiceItem').insert({
          id: crypto.randomUUID(),
          invoiceId: inv.id,
          deliveryId: d.id,
          lrNumber: d.lrNumber ?? d.deliveryNumber,
          vehicleNumber: d.vehicleNumber,
          weight: Number(d.adjustedWeight ?? 0),
          saleRate: Number(d.saleRate ?? 0),
          amount: Number(d.saleValue ?? 0),
        })
      }
      created.push(inv)
    }
    return json(created, 201)
  }

  // POST /invoices/:id/send  — send invoice via Resend
  if (req.method === 'POST' && secondLast !== 'invoices' && last === 'send') {
    const id = secondLast
    const { data: inv } = await db.from('Invoice')
      .select('*, customer:Customer(id,name,email,gstNumber,billingAddress,billingVillage,billingDistrict,billingState,billingPincode), commodity:Commodity(id,name,hsnCode), items:InvoiceItem(*)')
      .eq('id', id).single()
    if (!inv) return error('Invoice not found', 404)

    const toEmail = inv.customer?.email
    if (!toEmail) return error('Customer has no email address')

    const html = buildInvoiceHtml(inv)

    const resendKey = Deno.env.get('RESEND_API_KEY')
    if (!resendKey) return error('RESEND_API_KEY not configured')

    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'Akshaya Agri Solutions <onboarding@resend.dev>',
        to: [toEmail],
        reply_to: 'akshayaagrisolutions@gmail.com',
        subject: `Invoice ${inv.invoiceNumber} – Akshaya Agri Solutions`,
        html,
      }),
    })
    if (!resp.ok) {
      const body = await resp.text()
      return error(`Resend error: ${body}`)
    }

    await db.from('Invoice').update({ status: 'SENT', sentAt: new Date().toISOString() }).eq('id', id)
    return json({ success: true })
  }

  // GET /invoices
  if (req.method === 'GET' && last === 'invoices') {
    const { from, to, customerId, status } = Object.fromEntries(url.searchParams)
    let q = db.from('Invoice')
      .select('*, customer:Customer(id,name,email), commodity:Commodity(id,name)')
      .order('invoiceDate', { ascending: false })
    if (from) q = q.gte('invoiceDate', from)
    if (to) q = q.lte('invoiceDate', to)
    if (customerId) q = q.eq('customerId', customerId)
    if (status) q = q.eq('status', status)
    const { data } = await q
    return json(data)
  }

  // GET /invoices/:id
  if (req.method === 'GET' && last !== 'invoices') {
    const { data } = await db.from('Invoice')
      .select('*, customer:Customer(id,name,email,gstNumber,billingAddress,billingVillage,billingDistrict,billingState), commodity:Commodity(id,name,hsnCode), items:InvoiceItem(*)')
      .eq('id', last).single()
    return json(data)
  }

  // DELETE /invoices/:id  (only DRAFT invoices)
  if (req.method === 'DELETE' && last !== 'invoices') {
    const { data: inv } = await db.from('Invoice').select('status').eq('id', last).single()
    if (!inv) return error('Not found', 404)
    if (inv.status !== 'DRAFT') return error('Only DRAFT invoices can be deleted')
    await db.from('InvoiceItem').delete().eq('invoiceId', last)
    await db.from('Invoice').delete().eq('id', last)
    return json({ success: true })
  }

  return error('Not found', 404)
})

function buildInvoiceHtml(inv: any): string {
  const customer = inv.customer ?? {}
  const billingLines = [
    customer.name,
    customer.billingAddress,
    [customer.billingVillage, customer.billingDistrict].filter(Boolean).join(', '),
    [customer.billingState].filter(Boolean).join(', '),
    customer.gstNumber ? `GSTIN: ${customer.gstNumber}` : '',
  ].filter(Boolean).join('<br>')

  const items = (inv.items ?? []).map((item: any) => `
    <tr>
      <td style="padding:6px 10px;border-bottom:1px solid #eee;">${item.lrNumber ?? '-'}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #eee;">${item.vehicleNumber ?? '-'}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right;">${Number(item.weight).toLocaleString('en-IN', { maximumFractionDigits: 3 })} Qt</td>
      <td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right;">₹${Number(item.saleRate).toLocaleString('en-IN', { maximumFractionDigits: 2 })}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right;font-weight:600;">₹${Number(item.amount).toLocaleString('en-IN', { maximumFractionDigits: 2 })}</td>
    </tr>`).join('')

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><style>
  body{font-family:Arial,sans-serif;color:#222;margin:0;padding:0;background:#f5f5f5;}
  .wrap{max-width:700px;margin:32px auto;background:#fff;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,.1);padding:40px;}
  .header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:32px;}
  .company{font-size:20px;font-weight:700;color:#2e7d32;}
  .inv-title{font-size:24px;font-weight:700;color:#1677ff;margin-bottom:4px;}
  table{width:100%;border-collapse:collapse;}
  th{background:#f0f7f0;padding:8px 10px;text-align:left;font-size:13px;color:#444;}
  th:last-child,th:nth-child(3),th:nth-child(4){text-align:right;}
  .total-row td{padding:10px;font-weight:700;font-size:15px;background:#f9f9f9;}
  .footer{margin-top:32px;font-size:12px;color:#888;border-top:1px solid #eee;padding-top:16px;}
</style></head>
<body><div class="wrap">
  <div class="header">
    <div>
      <div class="company">Akshaya Agri Solutions</div>
      <div style="font-size:12px;color:#666;margin-top:4px;">Agricultural Commodity Trading</div>
    </div>
    <div style="text-align:right;">
      <div class="inv-title">INVOICE</div>
      <div style="font-size:14px;font-weight:600;">${inv.invoiceNumber}</div>
      <div style="font-size:13px;color:#666;margin-top:4px;">Date: ${new Date(inv.invoiceDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</div>
    </div>
  </div>

  <div style="display:flex;justify-content:space-between;margin-bottom:28px;">
    <div>
      <div style="font-size:11px;color:#888;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px;">Bill To</div>
      <div style="font-size:14px;line-height:1.6;">${billingLines}</div>
    </div>
    <div style="text-align:right;">
      <div style="font-size:11px;color:#888;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px;">Commodity</div>
      <div style="font-size:14px;font-weight:600;">${inv.commodity?.name ?? '-'}</div>
      ${inv.commodity?.hsnCode ? `<div style="font-size:12px;color:#666;">HSN: ${inv.commodity.hsnCode}</div>` : ''}
    </div>
  </div>

  <table>
    <thead><tr>
      <th>Slip / LR No.</th><th>Vehicle</th><th>Weight (Qt)</th><th>Rate (₹/Qt)</th><th>Amount (₹)</th>
    </tr></thead>
    <tbody>${items}</tbody>
    <tfoot>
      <tr class="total-row">
        <td colspan="2">Total</td>
        <td style="text-align:right;">${Number(inv.totalWeight).toLocaleString('en-IN', { maximumFractionDigits: 3 })} Qt</td>
        <td></td>
        <td style="text-align:right;color:#1677ff;">₹${Number(inv.totalAmount).toLocaleString('en-IN', { maximumFractionDigits: 2 })}</td>
      </tr>
    </tfoot>
  </table>

  <div class="footer">
    <p>This is a computer-generated invoice. For queries contact Akshaya Agri Solutions.</p>
  </div>
</div></body></html>`
}
