import { corsResponse, json, error } from '../_shared/cors.ts'
import { requireAuth } from '../_shared/auth.ts'

// Parses the Sarvani Bio Fuels "Consignor Wise Finished Weighing Trs Detailed Report"
// Weights in PDF are in KGs. We convert to quintals (÷100) for our system.

function parseRows(text: string): any[] {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
  const rows: any[] = []

  // Find all challan number positions — they delimit each record
  const challanIndices: number[] = []
  for (let i = 0; i < lines.length; i++) {
    if (/^\d{10}$/.test(lines[i])) challanIndices.push(i)
  }

  for (let c = 0; c < challanIndices.length; c++) {
    const start = challanIndices[c]
    const end = challanIndices[c + 1] ?? lines.length
    const challanNo = lines[start]
    // Each record's lines (between this challan and the next)
    const block = lines.slice(start + 1, end)

    // Dates: DD-Mon-YY  e.g. "02-May-26"
    const dates = block.filter(l => /^\d{1,2}-[A-Za-z]{3}-\d{2,4}$/.test(l))
    const inDate = dates[0] || ''
    const outDate = dates[1] || dates[0] || ''

    // Vehicle number: Indian reg plate style or "FR" (truck without plate)
    const truckNo = block.find(l => /^[A-Z]{2}\d{2}[A-Z0-9]{1,3}\d{3,4}$/.test(l) || l === 'FR') || ''

    // Commodity product
    const product = block.find(l => /^(MAIZE|HUSK|COAL|BIOMASS|RICE|WHEAT|PADDY|SOYBEAN|SUNFLOWER)$/i.test(l))?.toUpperCase() || ''

    // Weight values: 4–6 digit integers (500–99999 kg), strictly within this block
    const nums = block
      .filter(l => /^\d{4,6}$/.test(l))
      .map(l => parseInt(l, 10))
      .filter(n => n >= 500 && n <= 99999)

    if (nums.length < 2) continue

    // In the Sarvani PDF the order in the text is: Gross, Net (row1), Tare (row2)
    // Gross > Net > Tare always, so sort descending to identify each
    const sorted = [...nums].sort((a, b) => b - a)
    const grossKg = sorted[0]
    const netKg = sorted[1]
    const tareKg = sorted[2] ?? (grossKg - netKg)

    // Sanity check: gross = net + tare (±5% tolerance)
    const expectedGross = netKg + tareKg
    const validWeights = Math.abs(grossKg - expectedGross) / grossKg < 0.05

    rows.push({
      challanNo,
      inDate,
      outDate,
      vehicleNumber: truckNo,
      product,
      grossWeightKg: validWeights ? grossKg : expectedGross,
      tareWeightKg: tareKg,
      netWeightKg: netKg,
      grossWeight: +(( validWeights ? grossKg : expectedGross) / 100).toFixed(3),
      tareWeight: +(tareKg / 100).toFixed(3),
      netWeight: +(netKg / 100).toFixed(3),
    })
  }

  return rows
}

// Extract raw text from PDF bytes using a minimal PDF parser
// We avoid pdfjs worker issues by using a simple stream-based extractor
async function extractPdfText(bytes: Uint8Array): Promise<string> {
  // Use unpdf — a lightweight PDF text extractor that works in Deno/edge without workers
  // @ts-ignore
  const { extractText } = await import('https://esm.sh/unpdf@0.11.0')
  const result = await extractText(bytes, { mergePages: true })
  // unpdf returns { text: string } or { pages: string[] }
  if (typeof result === 'string') return result
  if (result?.text) return result.text
  if (result?.pages) return result.pages.join('\n')
  // Fallback: try treating result as array
  if (Array.isArray(result)) return result.join('\n')
  return String(result)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsResponse()

  const { user, response: authResponse } = await requireAuth(req)
  if (authResponse) return authResponse

  if (req.method !== 'POST') return error('Method not allowed', 405)

  const contentType = req.headers.get('content-type') || ''
  let extractedText = ''

  if (contentType.includes('multipart/form-data')) {
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    if (!file) return error('No file uploaded')

    const arrayBuffer = await file.arrayBuffer()
    const bytes = new Uint8Array(arrayBuffer)

    try {
      extractedText = await extractPdfText(bytes)
    } catch (err: any) {
      return error(`PDF parsing failed: ${err.message}`)
    }
  } else if (contentType.includes('application/json')) {
    const body = await req.json()
    extractedText = body.text || ''
  } else {
    return error('Expected multipart/form-data with a PDF file')
  }

  const rows = parseRows(extractedText)

  const dateMatch = extractedText.match(/Report From\s+(\d{1,2}[-\/][A-Za-z]+[-\/]\d{2,4})/i)
  const reportDate = dateMatch?.[1] || null
  const consignorMatch = extractedText.match(/Consignor:\s*(.+)/i)
  const consignor = consignorMatch?.[1]?.trim() || null

  return json({
    reportDate,
    consignor,
    rowCount: rows.length,
    rows,
    // include first 500 chars for debugging if rows=0
    debug: rows.length === 0 ? extractedText.slice(0, 500) : undefined,
  })
})
