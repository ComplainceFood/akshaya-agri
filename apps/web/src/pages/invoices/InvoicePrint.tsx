import dayjs from 'dayjs'

// Converts a number to Indian words
function toWords(amount: number): string {
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
    'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen']
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']

  function convert(n: number): string {
    if (n === 0) return ''
    if (n < 20) return ones[n] + ' '
    if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 ? ' ' + ones[n % 10] : '') + ' '
    if (n < 1000) return ones[Math.floor(n / 100)] + ' Hundred ' + convert(n % 100)
    if (n < 100000) return convert(Math.floor(n / 1000)) + 'Thousand ' + convert(n % 1000)
    if (n < 10000000) return convert(Math.floor(n / 100000)) + 'Lakhs ' + convert(n % 100000)
    return convert(Math.floor(n / 10000000)) + 'Crore ' + convert(n % 10000000)
  }

  const rupees = Math.floor(amount)
  const paise = Math.round((amount - rupees) * 100)
  let result = 'Rupees ' + convert(rupees).trim()
  if (paise > 0) result += ' and ' + convert(paise).trim() + ' Paise'
  result += ' Only'
  return result
}

interface InvoicePrintProps {
  inv: any
}

export function InvoicePrint({ inv }: InvoicePrintProps) {
  const customer = inv?.customer ?? {}
  const commodity = inv?.commodity ?? {}
  const items = inv?.items ?? []
  const totalAmount = Number(inv?.totalAmount ?? 0)
  const invoiceDate = dayjs(inv?.invoiceDate)
  const dueDate = invoiceDate.add(7, 'day')

  // Convert Kg to MT for display (1 MT = 1000 Kg)
  const totalWeightMT = Number(inv?.totalWeight ?? 0) / 1000

  const billToLines = [
    customer.name,
    customer.billingAddress,
    [customer.billingVillage, customer.billingDistrict].filter(Boolean).join(', '),
    customer.billingState,
    customer.billingPincode,
  ].filter(Boolean)

  const shipToLines = [
    customer.name,
    customer.shipAddress ?? customer.billingAddress,
    [customer.shipVillage ?? customer.billingVillage, customer.shipDistrict ?? customer.billingDistrict].filter(Boolean).join(', '),
    customer.shipState ?? customer.billingState,
    customer.shipPincode ?? customer.billingPincode,
  ].filter(Boolean)

  return (
    <div style={{ fontFamily: 'Arial, sans-serif', color: '#222', fontSize: 12, maxWidth: 800, margin: '0 auto', background: '#fff' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '16px 20px 12px', borderBottom: '2px solid #1a3a6b' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 700, color: '#1a3a6b', letterSpacing: 1 }}>Akshaya Agri Solutions</div>
            <div style={{ fontSize: 10, color: '#555', marginTop: 2 }}>Agri Commodities. Seamless Supply. Global Reach.</div>
            <div style={{ fontSize: 10, color: '#333', marginTop: 6, lineHeight: 1.6 }}>
              D. No 34-76, Srinagar Colony, Addanki,<br />
              Prakasam Dt, Andhra Pradesh 523201<br />
              Phone: 9029376519<br />
              Email: akshayaagrisolutions@gmail.com<br />
              GSTIN: 37DZWPS2859P1ZU<br />
              PAN: DZWPS2859P
            </div>
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 26, fontWeight: 700, color: '#1a3a6b', marginBottom: 4 }}>Tax Invoice</div>
          <div style={{ fontSize: 10, color: '#666', marginBottom: 12 }}>Original for recipient</div>
          <table style={{ fontSize: 11, borderCollapse: 'collapse', marginLeft: 'auto' }}>
            <tbody>
              <tr><td style={{ color: '#666', paddingRight: 12, paddingBottom: 2 }}>Date</td><td style={{ fontWeight: 600 }}>{invoiceDate.format('DD-MM-YYYY')}</td></tr>
              <tr><td style={{ color: '#666', paddingRight: 12, paddingBottom: 2 }}>Invoice #</td><td style={{ fontWeight: 600 }}>{inv?.invoiceNumber}</td></tr>
              <tr><td style={{ color: '#666', paddingRight: 12, paddingBottom: 2 }}>Payment Terms</td><td style={{ fontWeight: 600 }}>7 Days</td></tr>
              <tr><td style={{ color: '#666', paddingRight: 12, paddingBottom: 2 }}>Due Date</td><td style={{ fontWeight: 600 }}>{dueDate.format('DD-MM-YYYY')}</td></tr>
              <tr><td style={{ color: '#666', paddingRight: 12, paddingBottom: 2 }}>Place of Supply</td><td style={{ fontWeight: 600 }}>Andhra Pradesh(37)</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Bill To / Ship To */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderBottom: '1px solid #ccc' }}>
        <div style={{ padding: '10px 20px', borderRight: '1px solid #ccc' }}>
          <div style={{ background: '#1a3a6b', color: '#fff', fontSize: 10, fontWeight: 700, padding: '3px 6px', marginBottom: 6, letterSpacing: 0.5 }}>Bill to Party Address</div>
          <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 2 }}>{customer.name}</div>
          {billToLines.slice(1).map((l, i) => <div key={i} style={{ fontSize: 11, color: '#333', lineHeight: 1.5 }}>{l}</div>)}
          {customer.gstNumber && <div style={{ fontSize: 11, color: '#333', marginTop: 2 }}>GSTIN: {customer.gstNumber}</div>}
        </div>
        <div style={{ padding: '10px 20px' }}>
          <div style={{ background: '#1a3a6b', color: '#fff', fontSize: 10, fontWeight: 700, padding: '3px 6px', marginBottom: 6, letterSpacing: 0.5 }}>Ship to Party Address</div>
          <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 2 }}>{customer.name}</div>
          {shipToLines.slice(1).map((l, i) => <div key={i} style={{ fontSize: 11, color: '#333', lineHeight: 1.5 }}>{l}</div>)}
          {customer.gstNumber && <div style={{ fontSize: 11, color: '#333', marginTop: 2 }}>GSTIN: {customer.gstNumber}</div>}
        </div>
      </div>

      {/* Items Table */}
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
        <thead>
          <tr style={{ background: '#1a3a6b', color: '#fff' }}>
            <th style={{ padding: '6px 10px', textAlign: 'left', width: 30 }}>No.</th>
            <th style={{ padding: '6px 10px', textAlign: 'left' }}>Item &amp; Description</th>
            <th style={{ padding: '6px 10px', textAlign: 'center' }}>HSN Code</th>
            <th style={{ padding: '6px 10px', textAlign: 'right' }}>Quantity(MT)</th>
            <th style={{ padding: '6px 10px', textAlign: 'right' }}>Rate/MT</th>
            <th style={{ padding: '6px 10px', textAlign: 'right' }}>Amount</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item: any, idx: number) => {
            const weightMT = Number(item.weight) / 1000
            const rateMT = Number(item.saleRate) * 1000
            const amount = Number(item.amount)
            return (
              <tr key={item.id} style={{ borderBottom: '1px solid #eee' }}>
                <td style={{ padding: '8px 10px' }}>{idx + 1}</td>
                <td style={{ padding: '8px 10px', fontWeight: 600 }}>
                  {commodity.name}
                  {(item.lrNumber || item.vehicleNumber) && (
                    <div style={{ fontSize: 10, color: '#666', fontWeight: 400, marginTop: 2 }}>
                      {item.lrNumber && `LR: ${item.lrNumber}`}{item.lrNumber && item.vehicleNumber ? ' | ' : ''}{item.vehicleNumber && `Vehicle: ${item.vehicleNumber}`}
                    </div>
                  )}
                </td>
                <td style={{ padding: '8px 10px', textAlign: 'center' }}>{commodity.hsnCode ?? '-'}</td>
                <td style={{ padding: '8px 10px', textAlign: 'right' }}>{weightMT.toFixed(3)}</td>
                <td style={{ padding: '8px 10px', textAlign: 'right' }}>₹{rateMT.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</td>
                <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 600 }}>₹{amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
              </tr>
            )
          })}
          {/* Empty rows to pad table like sample */}
          {items.length < 4 && Array.from({ length: 4 - items.length }).map((_, i) => (
            <tr key={`empty-${i}`} style={{ borderBottom: '1px solid #eee' }}>
              <td style={{ padding: '16px 10px' }}></td>
              <td></td><td></td><td></td><td></td><td></td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr style={{ borderTop: '2px solid #1a3a6b' }}>
            <td colSpan={3} style={{ padding: '6px 10px', fontWeight: 700, fontSize: 12 }}>
              Subtotal
            </td>
            <td colSpan={2}></td>
            <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 700 }}>
              ₹{totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </td>
          </tr>
        </tfoot>
      </table>

      {/* Bottom Section: Terms + Summary */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderTop: '1px solid #ccc', marginTop: 0 }}>
        {/* Left: Terms + Amount in words + Bank Details */}
        <div style={{ padding: '10px 20px', borderRight: '1px solid #ccc' }}>
          <div style={{ background: '#1a3a6b', color: '#fff', fontSize: 10, fontWeight: 700, padding: '3px 6px', marginBottom: 6 }}>Terms &amp; Conditions</div>
          <div style={{ fontSize: 10, color: '#333', lineHeight: 1.8 }}>
            1. Total payment due in 7 days<br />
            2. Please include the invoice number on your cheque
          </div>

          <div style={{ background: '#1a3a6b', color: '#fff', fontSize: 10, fontWeight: 700, padding: '3px 6px', margin: '10px 0 6px' }}>Amount payable in words :</div>
          <div style={{ fontSize: 10, color: '#333', fontStyle: 'italic' }}>{toWords(totalAmount)}</div>

          <div style={{ background: '#1a3a6b', color: '#fff', fontSize: 10, fontWeight: 700, padding: '3px 6px', margin: '10px 0 6px' }}>Bank Details</div>
          <div style={{ fontSize: 10, color: '#333', lineHeight: 1.8 }}>
            Account Name : Akshaya Agri Solutions<br />
            Account No : 758405002779<br />
            IFSC Code : ICIC0007584<br />
            Bank (Branch) : ICICI (Addanki)
          </div>
        </div>

        {/* Right: Summary totals + Signature */}
        <div style={{ padding: '10px 20px' }}>
          <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse' }}>
            <tbody>
              {[
                { label: 'Subtotal', value: `₹${totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` },
                { label: 'Discount', value: '₹ -' },
                { label: 'GST', value: '₹ -' },
                { label: 'Roundoff', value: '₹ -' },
                { label: 'Other', value: '₹ -' },
              ].map(row => (
                <tr key={row.label}>
                  <td style={{ padding: '4px 6px', color: '#555' }}>{row.label}</td>
                  <td style={{ padding: '4px 6px', textAlign: 'right', color: '#555' }}>{row.value}</td>
                </tr>
              ))}
              <tr style={{ background: '#1a3a6b', color: '#fff' }}>
                <td style={{ padding: '6px 8px', fontWeight: 700, fontSize: 12 }}>Net Payable</td>
                <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 700, fontSize: 13 }}>
                  ₹{totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
              </tr>
            </tbody>
          </table>

          <div style={{ marginTop: 20, textAlign: 'right' }}>
            <div style={{ fontSize: 11, color: '#333', marginBottom: 40 }}>For Akshaya Agri Solutions</div>
            <div style={{ borderTop: '1px solid #555', display: 'inline-block', width: 120, paddingTop: 4, fontSize: 10, color: '#666' }}>Authorised Signatory</div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div style={{ background: '#1a3a6b', color: '#fff', textAlign: 'center', fontSize: 10, padding: '6px 10px', marginTop: 0 }}>
        <div style={{ fontWeight: 700, marginBottom: 2 }}>Thank You For Your Business!</div>
        <div>If you have any questions about this invoice, please call us on 9029376519 or email us to akshayaagrisolutions@gmail.com</div>
      </div>
    </div>
  )
}

function renderInvoiceToContainer(inv: any): Promise<{ container: HTMLDivElement; unmount: () => void }> {
  return new Promise((resolve) => {
    const container = document.createElement('div')
    container.style.cssText = 'position:fixed;left:-9999px;top:0;width:800px;background:#fff;'
    document.body.appendChild(container)

    import('react').then(React => {
      import('react-dom/client').then(({ createRoot }) => {
        const root = createRoot(container)
        root.render(React.createElement(InvoicePrint, { inv }))
        setTimeout(() => resolve({
          container,
          unmount: () => { root.unmount(); document.body.removeChild(container) }
        }), 400)
      })
    })
  })
}

export function printInvoice(inv: any) {
  renderInvoiceToContainer(inv).then(({ container, unmount }) => {
    const win = window.open('', '_blank', 'width=900,height=700')
    if (!win) { unmount(); return }

    win.document.write(`<!DOCTYPE html><html><head>
      <title>Invoice ${inv?.invoiceNumber ?? ''}</title>
      <style>
        @media print { body { margin: 0; } @page { margin: 12mm; size: A4; } }
        body { font-family: Arial, sans-serif; margin: 0; padding: 0; background: #fff; }
      </style>
    </head><body>${container.innerHTML}</body></html>`)
    win.document.close()
    win.focus()
    setTimeout(() => { win.print(); unmount() }, 400)
  })
}

export async function generatePdfBase64(inv: any): Promise<string> {
  const { container, unmount } = await renderInvoiceToContainer(inv)
  try {
    const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
      import('html2canvas'),
      import('jspdf'),
    ])
    const canvas = await html2canvas(container, { scale: 2, useCORS: true, backgroundColor: '#fff' })
    const imgData = canvas.toDataURL('image/jpeg', 0.95)
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
    const pageW = pdf.internal.pageSize.getWidth()
    const pageH = pdf.internal.pageSize.getHeight()
    const imgRatio = canvas.height / canvas.width
    const imgH = pageW * imgRatio
    let yOffset = 0
    let remaining = imgH
    while (remaining > 0) {
      pdf.addImage(imgData, 'JPEG', 0, -yOffset, pageW, imgH)
      remaining -= pageH
      yOffset += pageH
      if (remaining > 0) pdf.addPage()
    }
    // Return base64 without the data: prefix
    return pdf.output('datauristring').split(',')[1]
  } finally {
    unmount()
  }
}
