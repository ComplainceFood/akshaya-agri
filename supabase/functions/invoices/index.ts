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

  // POST /invoices/preview  - group deliveries into draft invoices (no DB write)
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

  // POST /invoices/generate  - create Invoice + InvoiceItem rows for selected groups
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

  // POST /invoices/:id/send  - send invoice via Resend
  if (req.method === 'POST' && secondLast !== 'invoices' && last === 'send') {
    const id = secondLast
    const { pdfBase64 } = await req.json().catch(() => ({}))

    const { data: inv } = await db.from('Invoice')
      .select('*, customer:Customer(id,name,email,gstNumber,billingAddress,billingVillage,billingDistrict,billingState,billingPincode), commodity:Commodity(id,name,hsnCode), items:InvoiceItem(*)')
      .eq('id', id).single()
    if (!inv) return error('Invoice not found', 404)

    const toEmail = inv.customer?.email
    if (!toEmail) return error('Customer has no email address')

    const resendKey = Deno.env.get('RESEND_API_KEY')
    if (!resendKey) return error('RESEND_API_KEY not configured')

    const invoiceDate = new Date(inv.invoiceDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })
    const totalAmount = Number(inv.totalAmount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    const dueDate = new Date(new Date(inv.invoiceDate).getTime() + 7 * 86400000).toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })

    const html = buildEmailHtml({ inv, invoiceDate, totalAmount, dueDate })

    const payload: any = {
      from: 'Akshaya Agri Solutions <onboarding@resend.dev>',
      to: [toEmail],
      reply_to: 'akshayaagrisolutions@gmail.com',
      subject: `Invoice ${inv.invoiceNumber} from Akshaya Agri Solutions`,
      html,
    }

    if (pdfBase64) {
      payload.attachments = [{
        filename: `${inv.invoiceNumber}.pdf`,
        content: pdfBase64,
      }]
    }

    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
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

  // PUT /invoices/:id  - update header + replace items
  if (req.method === 'PUT' && last !== 'invoices') {
    const id = last
    const { data: inv } = await db.from('Invoice').select('id').eq('id', id).single()
    if (!inv) return error('Not found', 404)
    const body = await req.json()
    const { invoiceDate, customerId, commodityId, status, items } = body
    // Recalculate totals from items
    const totalWeight = (items ?? []).reduce((s: number, it: any) => s + Number(it.weight ?? 0), 0)
    const totalAmount = (items ?? []).reduce((s: number, it: any) => s + Number(it.amount ?? 0), 0)
    const { error: updErr } = await db.from('Invoice')
      .update({ invoiceDate, customerId, commodityId, status, totalWeight, totalAmount, updatedAt: new Date().toISOString() })
      .eq('id', id)
    if (updErr) return error(updErr.message)
    if (items) {
      await db.from('InvoiceItem').delete().eq('invoiceId', id)
      for (const it of items) {
        await db.from('InvoiceItem').insert({
          id: crypto.randomUUID(),
          invoiceId: id,
          deliveryId: it.deliveryId ?? null,
          lrNumber: it.lrNumber ?? null,
          vehicleNumber: it.vehicleNumber ?? null,
          weight: Number(it.weight ?? 0),
          saleRate: Number(it.saleRate ?? 0),
          amount: Number(it.amount ?? 0),
        })
      }
    }
    const { data: updated } = await db.from('Invoice')
      .select('*, customer:Customer(id,name,email,gstNumber,billingAddress,billingVillage,billingDistrict,billingState), commodity:Commodity(id,name,hsnCode), items:InvoiceItem(*)')
      .eq('id', id).single()
    return json(updated)
  }

  // POST /invoices/create  - manually create an invoice with items
  if (req.method === 'POST' && last === 'create') {
    const body = await req.json()
    const { customerId, commodityId, invoiceDate, items = [] } = body
    const totalWeight = items.reduce((s: number, it: any) => s + Number(it.weight ?? 0), 0)
    const totalAmount = items.reduce((s: number, it: any) => s + Number(it.amount ?? 0), 0)
    const invoiceNumber = await getNextNumber(db, 'INV')
    const now = new Date().toISOString()
    const { data: inv, error: invErr } = await db.from('Invoice').insert({
      id: crypto.randomUUID(),
      invoiceNumber,
      customerId,
      commodityId,
      invoiceDate,
      totalWeight,
      totalAmount,
      status: 'DRAFT',
      createdAt: now,
      updatedAt: now,
    }).select().single()
    if (invErr) return error(invErr.message)
    for (const it of items) {
      await db.from('InvoiceItem').insert({
        id: crypto.randomUUID(),
        invoiceId: inv.id,
        deliveryId: it.deliveryId ?? null,
        lrNumber: it.lrNumber ?? null,
        vehicleNumber: it.vehicleNumber ?? null,
        weight: Number(it.weight ?? 0),
        saleRate: Number(it.saleRate ?? 0),
        amount: Number(it.amount ?? 0),
      })
    }
    return json(inv, 201)
  }

  // DELETE /invoices/:id
  if (req.method === 'DELETE' && last !== 'invoices') {
    const { data: inv } = await db.from('Invoice').select('status').eq('id', last).single()
    if (!inv) return error('Not found', 404)
    await db.from('InvoiceItem').delete().eq('invoiceId', last)
    await db.from('Invoice').delete().eq('id', last)
    return json({ success: true })
  }

  return error('Not found', 404)
})

function buildEmailHtml({ inv, invoiceDate, totalAmount, dueDate }: { inv: any; invoiceDate: string; totalAmount: string; dueDate: string }): string {
  const customer = inv.customer ?? {}
  const commodity = inv.commodity ?? {}
  const customerName = customer.name ?? 'Valued Customer'
  const billingAddr = [customer.billingAddress, customer.billingVillage, customer.billingDistrict, customer.billingState]
    .filter(Boolean).join(', ')

  const itemRows = (inv.items ?? []).map((item: any, idx: number) => {
    const weightMT = (Number(item.weight) / 10).toFixed(3)
    const rateMT = (Number(item.saleRate) * 10).toLocaleString('en-IN', { maximumFractionDigits: 2 })
    const amount = Number(item.amount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    return `<tr>
      <td style="padding:8px 12px;border-bottom:1px solid #e8e8e8;color:#555;">${idx + 1}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e8e8e8;">
        <strong>${commodity.name ?? '-'}</strong>
        ${item.lrNumber ? `<br><span style="font-size:11px;color:#888;">LR: ${item.lrNumber}${item.vehicleNumber ? ' &nbsp;|&nbsp; Vehicle: ' + item.vehicleNumber : ''}</span>` : ''}
      </td>
      <td style="padding:8px 12px;border-bottom:1px solid #e8e8e8;text-align:center;color:#555;">${commodity.hsnCode ?? '-'}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e8e8e8;text-align:right;color:#555;">${weightMT}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e8e8e8;text-align:right;color:#555;">₹${rateMT}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e8e8e8;text-align:right;font-weight:600;">₹${amount}</td>
    </tr>`
  }).join('')

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f0f2f5;font-family:Arial,sans-serif;color:#222;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f2f5;padding:32px 0;">
<tr><td align="center">
<table width="620" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.08);">

  <!-- Header -->
  <tr>
    <td style="background:#1a3a6b;padding:24px 32px;">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td>
            <div style="font-size:22px;font-weight:700;color:#fff;letter-spacing:1px;">Akshaya Agri Solutions</div>
            <div style="font-size:11px;color:#a8c4e0;margin-top:2px;">Agri Commodities. Seamless Supply. Global Reach.</div>
          </td>
          <td align="right">
            <div style="font-size:20px;font-weight:700;color:#fff;">Tax Invoice</div>
            <div style="font-size:13px;color:#a8c4e0;margin-top:2px;">${inv.invoiceNumber}</div>
          </td>
        </tr>
      </table>
    </td>
  </tr>

  <!-- Greeting -->
  <tr>
    <td style="padding:28px 32px 0;">
      <p style="margin:0 0 8px;font-size:15px;">Dear <strong>${customerName}</strong>,</p>
      <p style="margin:0;font-size:13px;color:#555;line-height:1.6;">
        Please find attached your invoice <strong>${inv.invoiceNumber}</strong> dated <strong>${invoiceDate}</strong> for the supply of <strong>${commodity.name ?? 'commodity'}</strong>.
        The invoice is also summarised below for your reference.
      </p>
    </td>
  </tr>

  <!-- Invoice Meta -->
  <tr>
    <td style="padding:20px 32px 0;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#f7f9fc;border-radius:6px;border:1px solid #e0e7ef;">
        <tr>
          <td style="padding:12px 16px;border-right:1px solid #e0e7ef;width:25%;">
            <div style="font-size:10px;color:#888;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px;">Invoice No.</div>
            <div style="font-size:13px;font-weight:700;color:#1a3a6b;">${inv.invoiceNumber}</div>
          </td>
          <td style="padding:12px 16px;border-right:1px solid #e0e7ef;width:25%;">
            <div style="font-size:10px;color:#888;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px;">Invoice Date</div>
            <div style="font-size:13px;font-weight:600;">${invoiceDate}</div>
          </td>
          <td style="padding:12px 16px;border-right:1px solid #e0e7ef;width:25%;">
            <div style="font-size:10px;color:#888;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px;">Due Date</div>
            <div style="font-size:13px;font-weight:600;color:#c0392b;">${dueDate}</div>
          </td>
          <td style="padding:12px 16px;width:25%;">
            <div style="font-size:10px;color:#888;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px;">Amount Due</div>
            <div style="font-size:14px;font-weight:700;color:#1a3a6b;">₹${totalAmount}</div>
          </td>
        </tr>
      </table>
    </td>
  </tr>

  <!-- Bill To -->
  <tr>
    <td style="padding:16px 32px 0;">
      <div style="font-size:10px;color:#888;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px;">Bill To</div>
      <div style="font-size:13px;font-weight:600;">${customerName}</div>
      <div style="font-size:12px;color:#555;">${billingAddr || ''}</div>
      ${customer.gstNumber ? `<div style="font-size:12px;color:#555;">GSTIN: ${customer.gstNumber}</div>` : ''}
    </td>
  </tr>

  <!-- Items Table -->
  <tr>
    <td style="padding:20px 32px 0;">
      <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e0e7ef;border-radius:6px;overflow:hidden;font-size:12px;">
        <thead>
          <tr style="background:#1a3a6b;color:#fff;">
            <th style="padding:10px 12px;text-align:left;font-weight:600;width:30px;">No.</th>
            <th style="padding:10px 12px;text-align:left;font-weight:600;">Item &amp; Description</th>
            <th style="padding:10px 12px;text-align:center;font-weight:600;">HSN Code</th>
            <th style="padding:10px 12px;text-align:right;font-weight:600;">Qty (MT)</th>
            <th style="padding:10px 12px;text-align:right;font-weight:600;">Rate/MT</th>
            <th style="padding:10px 12px;text-align:right;font-weight:600;">Amount</th>
          </tr>
        </thead>
        <tbody>${itemRows}</tbody>
        <tfoot>
          <tr style="background:#1a3a6b;color:#fff;">
            <td colspan="5" style="padding:10px 12px;font-weight:700;font-size:13px;">Net Payable</td>
            <td style="padding:10px 12px;text-align:right;font-weight:700;font-size:14px;">₹${totalAmount}</td>
          </tr>
        </tfoot>
      </table>
    </td>
  </tr>

  <!-- Bank Details -->
  <tr>
    <td style="padding:20px 32px 0;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#f7f9fc;border-radius:6px;border:1px solid #e0e7ef;font-size:12px;">
        <tr>
          <td style="padding:12px 16px;border-right:1px solid #e0e7ef;">
            <div style="font-size:10px;color:#888;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px;">Bank Details</div>
            <div><strong>Account Name:</strong> Akshaya Agri Solutions</div>
            <div><strong>Account No:</strong> 758405002779</div>
            <div><strong>IFSC Code:</strong> ICIC0007584</div>
            <div><strong>Bank (Branch):</strong> ICICI (Addanki)</div>
          </td>
          <td style="padding:12px 16px;">
            <div style="font-size:10px;color:#888;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px;">Payment Terms</div>
            <div style="color:#555;">Payment due within <strong>7 days</strong> of invoice date.</div>
            <div style="color:#555;margin-top:4px;">Please include the invoice number on your cheque or bank transfer.</div>
          </td>
        </tr>
      </table>
    </td>
  </tr>

  <!-- Closing Note -->
  <tr>
    <td style="padding:24px 32px;">
      <p style="margin:0 0 8px;font-size:13px;color:#555;line-height:1.6;">
        The PDF invoice is attached to this email for your records. If you have any questions or discrepancies, please do not hesitate to contact us.
      </p>
      <p style="margin:0;font-size:13px;color:#555;">
        Thank you for your continued business with us.
      </p>
      <p style="margin:16px 0 0;font-size:13px;">
        Warm regards,<br>
        <strong>Akshaya Agri Solutions</strong><br>
        <span style="color:#888;font-size:12px;">Phone: 9029376519 &nbsp;|&nbsp; akshayaagrisolutions@gmail.com</span>
      </p>
    </td>
  </tr>

  <!-- Footer -->
  <tr>
    <td style="background:#1a3a6b;padding:14px 32px;text-align:center;">
      <div style="font-size:11px;color:#a8c4e0;">
        D. No 34-76, Srinagar Colony, Addanki, Prakasam Dt, Andhra Pradesh 523201
      </div>
      <div style="font-size:10px;color:#7a9cbe;margin-top:4px;">GSTIN: 37DZWPS2859P1ZU &nbsp;|&nbsp; PAN: DZWPS2859P</div>
    </td>
  </tr>

</table>
</td></tr>
</table>
</body></html>`
}
