import { corsResponse, json, error } from '../_shared/cors.ts'
import { requireAuth } from '../_shared/auth.ts'

// unpdf flattens this PDF into one continuous string (no line breaks between cells).
// Each record ends with PRODUCT+ChallanNo e.g. "MAIZE2627000518" or "MAIZE-BAGS2627000518".
// The weights/dates for that record appear in the segment BEFORE the marker.
//
// Both old and new formats share the same column layout (Gross/Tare/Net positions).
// New format adds a 3rd header row (Load Type / No of Bags / Amount) but weight data
// is still in the same columns — one weight glued to inDate, others standalone before it.
//   Old: "21110 11940 917001-May-26" → standalones 21110,11940; glued 9170
//   New: "460 36790 10720 2607004-May-26" → standalones 36790,10720 (460=bags,filtered); glued 26070
//
// Anchor to isolate the weight zone:
//   Old format: " 1 1 " (Challan=1 + another col=1 in flat text)
//   New format: " 1 "   (only one col=1 due to extra columns shifting layout)

function parseRows(text: string): any[] {
  const rows: any[] = []
  const productList = 'MAIZE|HUSK|COAL|BIOMASS|RICE|WHEAT|PADDY|SOYBEAN|SUNFLOWER'
  // Allow optional suffix e.g. "MAIZE-BAGS", "MAIZE BAGS"; challan is always 10 digits
  const recordRe = new RegExp(`(${productList})(?:[-\\s][A-Z]+)?(\\d{10})`, 'gi')

  const markers: Array<{ matchStart: number; matchEnd: number; product: string; challanNo: string }> = []
  let m: RegExpExecArray | null
  while ((m = recordRe.exec(text)) !== null) {
    markers.push({ matchStart: m.index, matchEnd: m.index + m[0].length, product: m[1].toUpperCase(), challanNo: m[2] })
  }

  for (let s = 0; s < markers.length; s++) {
    const { product, challanNo, matchStart, matchEnd } = markers[s]
    // Segment: from end of previous marker to start of current PRODUCT word
    const segStart = s === 0 ? 0 : markers[s - 1].matchEnd
    const seg = text.slice(segStart, matchStart)

    // Find last " 1 1 " (old format) or " 1 " (new format) to skip report header noise
    const anchor11 = seg.lastIndexOf(' 1 1 ')
    const anchor1 = seg.lastIndexOf(' 1 ')
    let weightZone: string
    if (anchor11 >= 0) {
      weightZone = seg.slice(anchor11 + 5)
    } else if (anchor1 >= 0) {
      weightZone = seg.slice(anchor1 + 3)
    } else {
      weightZone = seg
    }

    // Extract dates from weightZone
    const allDates = [...weightZone.matchAll(/(\d{1,2}-[A-Za-z]{3}-\d{2,4})/g)].map(x => x[1])
    const inDate = allDates[0] || ''
    const outDate = allDates[1] || allDates[0] || ''

    // Truck number: appears after outDate or anywhere in weightZone
    const truckZone = outDate ? weightZone.slice(weightZone.lastIndexOf(outDate)) : weightZone
    const truckMatch = truckZone.match(/\b([A-Z]{2}\d{2}[A-Z0-9]{1,3}\d{3,4})\b/) ||
                       truckZone.match(/\b(FR)\b/) ||
                       weightZone.match(/\b([A-Z]{2}\d{2}[A-Z0-9]{1,3}\d{3,4})\b/) ||
                       weightZone.match(/\b(FR)\b/)
    const vehicleNumber = truckMatch?.[1] || ''

    // Standalone weights: 4-6 digit numbers before inDate
    // In new format these include bags count (e.g. 460) and amount (e.g. 0) — filter by plausible
    // weight range (>= 1000 kg) to exclude those small values
    const beforeInDate = inDate ? weightZone.slice(0, weightZone.indexOf(inDate)) : weightZone.slice(0, 80)
    const standalones = [...beforeInDate.matchAll(/\b(\d{4,6})\b/g)]
      .map(x => parseInt(x[1]))
      .filter(n => n >= 1000 && n <= 99999)

    // Glued weight: digits immediately before inDate (present in both formats)
    // e.g. old "11940 917001-May-26" → glued 9170; new "10720 2607004-May-26" → glued 26070
    let gluedWeight = 0
    if (inDate) {
      const idxDate = weightZone.indexOf(inDate)
      const lookback = weightZone.slice(Math.max(0, idxDate - 7), idxDate)
      const gm = lookback.match(/(\d{3,6})$/)
      if (gm) gluedWeight = parseInt(gm[1])
    }

    // Build full weight set, avoiding duplicates
    const weightSet = new Set(standalones)
    if (gluedWeight >= 1000 && gluedWeight <= 99999) weightSet.add(gluedWeight)
    const allWeights = [...weightSet]

    if (allWeights.length < 2) continue

    const sorted = [...allWeights].sort((a, b) => b - a)
    const grossKg = sorted[0]
    const netKg = sorted[1]
    const tareKg = sorted[2] ?? (grossKg - netKg)

    rows.push({
      challanNo,
      inDate,
      outDate,
      vehicleNumber,
      product,
      grossWeight: grossKg,
      tareWeight: tareKg,
      netWeight: netKg,
    })
  }

  return rows
}

async function extractPdfText(bytes: Uint8Array): Promise<string> {
  // @ts-ignore
  const { extractText } = await import('https://esm.sh/unpdf@0.11.0')
  const result = await extractText(bytes, { mergePages: true })
  if (typeof result === 'string') return result
  if (result?.text) return result.text
  if (result?.pages) return (result.pages as string[]).join('\n')
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

    const bytes = new Uint8Array(await file.arrayBuffer())
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
  const consignorMatch = extractedText.match(/Consignor:\s*(.+?)(?:\s{2,}|Report|$)/i)
  const consignor = consignorMatch?.[1]?.trim() || null

  return json({
    reportDate,
    consignor,
    rowCount: rows.length,
    rows,
    debug: extractedText.slice(0, 2000),
  })
})
