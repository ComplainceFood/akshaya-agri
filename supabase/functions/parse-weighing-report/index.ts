import { corsResponse, json, error } from '../_shared/cors.ts'
import { requireAuth } from '../_shared/auth.ts'

// Parses the Sarvani Bio Fuels "Consignor Wise Finished Weighing Trs Detailed Report" PDF
// The PDF text layout (extracted by pdfjs) contains rows like:
//   ChallanNo  InDate  OutDate  INBOUND  ConsignorName  ProductName  1  Gross  Net
//   InTime  OutTime  TruckNo  ConsigneeName  1  Tare
// Weights are in KGs in the source PDF.

function parseRows(text: string): any[] {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
  const rows: any[] = []

  // Find lines that look like challan numbers (all digits, 10 chars)
  const challanPattern = /^(\d{10})$/
  // Date pattern: DD-Mon-YY or DD/MM/YYYY
  const datePattern = /^(\d{1,2}[-\/]\w+[-\/]\d{2,4})$/
  // Weight: pure number possibly with comma
  const numPattern = /^[\d,]+$/

  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (!challanPattern.test(line)) { i++; continue }

    // Found a challan number — try to parse the next few lines as a record
    const challanNo = line
    let inDate = '', outDate = '', truckNo = '', grossKg = 0, tareKg = 0, netKg = 0
    let product = ''

    // Look ahead up to 8 lines for the data
    const window = lines.slice(i + 1, i + 12)

    // Find dates
    const dates = window.filter(l => /^\d{1,2}-\w{3}-\d{2}$/.test(l) || /^\d{1,2}\/\d{2}\/\d{4}$/.test(l))
    if (dates.length >= 1) inDate = dates[0]
    if (dates.length >= 2) outDate = dates[1]

    // Find truck number (vehicle reg pattern: letters+digits, or 'FR' for freight)
    const truckLine = window.find(l => /^[A-Z]{2}\d{2}[A-Z]{2}\d{4}$/.test(l) || /^[A-Z]{2}\d{2}[A-Z]+\d{4}$/.test(l) || l === 'FR')
    if (truckLine) truckNo = truckLine

    // Find product (MAIZE, HUSK, COAL, BIOMASS, RICE etc)
    const productLine = window.find(l => /^(MAIZE|HUSK|COAL|BIOMASS|RICE|WHEAT|PADDY|SOYBEAN)$/i.test(l))
    if (productLine) product = productLine.toUpperCase()

    // Find weights — three consecutive number-looking values
    const nums = window.filter(l => /^\d[\d,]*$/.test(l)).map(l => parseInt(l.replace(/,/g, ''), 10)).filter(n => n > 100)
    if (nums.length >= 3) {
      // Gross is largest, tare is smallest, net is middle
      const sorted = [...nums].sort((a, b) => b - a)
      grossKg = sorted[0]
      netKg = sorted[1]
      tareKg = sorted[2] ?? (grossKg - netKg)
    } else if (nums.length === 2) {
      grossKg = nums[0]
      tareKg = nums[1]
      netKg = grossKg - tareKg
    }

    if (grossKg > 0) {
      rows.push({
        challanNo,
        inDate,
        outDate,
        vehicleNumber: truckNo || '',
        product,
        grossWeightKg: grossKg,
        tareWeightKg: tareKg,
        netWeightKg: netKg,
        // Convert kg → quintals (1 Qt = 100 kg)
        grossWeight: grossKg / 100,
        tareWeight: tareKg / 100,
        netWeight: netKg / 100,
      })
    }

    i++
  }

  return rows
}

// Alternative: parse the structured text that comes from pdfjs-dist text extraction
// The PDF has a fixed table structure — we use positional heuristics on the raw text
function parseStructured(text: string): any[] {
  const rows: any[] = []

  // Split into blocks by challan number pattern (10-digit number at start of meaningful block)
  // Each record in the Sarvani report spans 2 lines:
  // Line1: ChallanNo  InDate  OutDate  INBOUND  AKSHYA AGRI...  PRODUCT  1  Gross  Net
  // Line2: InTime  OutTime  TruckNo  SARVANI BIO  1  Tare

  // We'll use a regex to find all challan numbers and capture surrounding context
  const challanRe = /(\d{10})\s+(\d{1,2}-\w{3}-\d{2})\s+(\d{1,2}-\w{3}-\d{2})\s+\S+\s+.*?(\d{5,6})\s+(\d{4,5})\s*\n.*?([A-Z]{2}\d{2}[A-Z0-9]+\d{4}|FR)\s+.*?(\d{4,5})/gm

  let m
  while ((m = challanRe.exec(text)) !== null) {
    const [, challanNo, inDate, outDate, gross, net, truckNo, tare] = m
    const grossKg = parseInt(gross, 10)
    const tареKg = parseInt(tare, 10)
    const netKg = parseInt(net, 10)
    rows.push({
      challanNo,
      inDate,
      outDate,
      vehicleNumber: truckNo,
      grossWeightKg: grossKg,
      tareWeightKg: tареKg,
      netWeightKg: netKg,
      grossWeight: grossKg / 100,
      tareWeight: tареKg / 100,
      netWeight: netKg / 100,
    })
  }

  return rows
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsResponse()

  const { user, response: authResponse } = await requireAuth(req)
  if (authResponse) return authResponse

  if (req.method !== 'POST') return error('Method not allowed', 405)

  const contentType = req.headers.get('content-type') || ''

  let extractedText = ''

  if (contentType.includes('multipart/form-data')) {
    // Receive the PDF file and extract text using pdfjs-dist
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    if (!file) return error('No file uploaded')

    const arrayBuffer = await file.arrayBuffer()
    const uint8 = new Uint8Array(arrayBuffer)

    // Use pdfjs-dist for text extraction
    try {
      // @ts-ignore
      const pdfjsLib = await import('https://esm.sh/pdfjs-dist@4.4.168/build/pdf.mjs')
      pdfjsLib.GlobalWorkerOptions.workerSrc = ''

      const loadingTask = pdfjsLib.getDocument({ data: uint8, useWorkerFetch: false, isEvalSupported: false, useSystemFonts: true })
      const pdfDoc = await loadingTask.promise

      const textParts: string[] = []
      for (let p = 1; p <= pdfDoc.numPages; p++) {
        const page = await pdfDoc.getPage(p)
        const content = await page.getTextContent()
        // Sort items by vertical then horizontal position for reading order
        const items = (content.items as any[])
          .filter((item: any) => item.str?.trim())
          .sort((a: any, b: any) => {
            const yDiff = Math.round(b.transform[5]) - Math.round(a.transform[5])
            if (Math.abs(yDiff) > 3) return yDiff
            return a.transform[4] - b.transform[4]
          })
        textParts.push(items.map((i: any) => i.str).join('\n'))
      }
      extractedText = textParts.join('\n')
    } catch (err: any) {
      return error(`PDF parsing failed: ${err.message}`)
    }
  } else if (contentType.includes('application/json')) {
    // Accept pre-extracted text for testing
    const body = await req.json()
    extractedText = body.text || ''
  } else {
    return error('Expected multipart/form-data with a PDF file')
  }

  // Try structured parse first, fall back to line-by-line
  let rows = parseStructured(extractedText)
  if (rows.length === 0) rows = parseRows(extractedText)

  // Extract report metadata
  const dateMatch = extractedText.match(/Report From\s+(\d{1,2}[-\/]\w+[-\/]\d{2,4})/i)
  const reportDate = dateMatch?.[1] || null
  const consignorMatch = extractedText.match(/Consignor:\s*(.+)/i)
  const consignor = consignorMatch?.[1]?.trim() || null

  return json({
    reportDate,
    consignor,
    rowCount: rows.length,
    rows,
    rawTextLength: extractedText.length,
  })
})
