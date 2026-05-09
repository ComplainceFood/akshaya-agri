import { corsResponse, json, error } from '../_shared/cors.ts'
import { requireAuth } from '../_shared/auth.ts'

// unpdf flattens this PDF into one continuous string (no line breaks between cells).
// Each record's data appears BEFORE its challan number.
//
// Old format: weights packed tightly, one "glued" to the inDate
//   e.g. "21110 11940 917001-May-26" → 21110, 11940 standalone; 9170 glued before "01-May-26"
//
// New format (from May 2026): additional Load Type / No of Bags / Amount columns;
//   all three weights are space-separated standalones before inDate
//   e.g. "36790 26070\n0\n460\n10720\n04-May-26" → 36790 gross, 26070 net, 10720 tare (all standalone)
//
// In both cases: sort collected weights → gross=max, net=mid, tare=min

function parseRows(text: string): any[] {
  const rows: any[] = []
  const productList = 'MAIZE|HUSK|COAL|BIOMASS|RICE|WHEAT|PADDY|SOYBEAN|SUNFLOWER'
  // Allow optional suffix after product name e.g. "MAIZE-BAGS", "MAIZE BAGS"
  const recordRe = new RegExp(`(${productList})(?:[-\\s][A-Z]+)?(\\d{10})`, 'gi')

  // Each PRODUCT+ChallanNo marks the END of that record's data in the flat text
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

    // Find the best anchor to skip report header noise before the weight data.
    //
    // New format: "INBOUND" appears BEFORE the weights and dates in the segment
    //   (Transaction column is an early column in the new layout)
    // Old format: "INBOUND" appears AFTER the weights/dates (between truck and product)
    //   so we use the " 1 1 " anchor instead.
    //
    // Detect new format by checking if "INBOUND" precedes the first date in the segment.
    const firstDateInSeg = seg.match(/\d{1,2}-[A-Za-z]{3}-\d{2,4}/)
    const inboundIdx = seg.lastIndexOf('INBOUND ')
    const firstDateIdx = firstDateInSeg ? seg.indexOf(firstDateInSeg[0]) : -1
    const isNewFormat = inboundIdx >= 0 && (firstDateIdx < 0 || inboundIdx < firstDateIdx)

    const oldAnchor = seg.lastIndexOf(' 1 1 ')
    let weightZone: string
    if (isNewFormat) {
      // New format: weights and dates come after "INBOUND <consignor> <consignee>"
      // Skip past INBOUND — the weights appear after the consignee name block
      weightZone = seg.slice(inboundIdx + 8)
    } else if (oldAnchor >= 0) {
      weightZone = seg.slice(oldAnchor + 5)
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

    // Glued weight (old format only): digits immediately before inDate
    // e.g. "11940 917001-May-26" → the chars right before "01-May-26" are "9170"
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
      grossWeightKg: grossKg,
      tareWeightKg: tareKg,
      netWeightKg: netKg,
      grossWeight: +(grossKg / 100).toFixed(3),
      tareWeight: +(tareKg / 100).toFixed(3),
      netWeight: +(netKg / 100).toFixed(3),
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
