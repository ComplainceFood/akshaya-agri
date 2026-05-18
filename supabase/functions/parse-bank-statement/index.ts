import { corsResponse, json, error } from '../_shared/cors.ts'
import { requireAuth } from '../_shared/auth.ts'

// ICICI Bank Detailed Statement PDF parser
//
// unpdf flattens the PDF into one string. The ICICI statement repeats this pattern
// for every transaction:
//
//   <SI_NO> S<digits>[<digits>] <DD/Mon/YY[YY]>[<YY>] <DD/Mon/YYYY> <DD-Mon-YYYY HH:MM:SS AM/PM>
//   <REMARKS...> <AMOUNT.CC> <BALANCE.CC>
//
// The SI number is the most reliable anchor: a small integer (1–3 digits) followed
// by an S-prefixed tran id. We find all SI boundaries in sequence, slice the text
// between them, then extract amount and date with regex.

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

// Parse Indian-formatted amount strings like "1,00,000.00" or "1,00,000. 00"
function parseINR(s: string): number {
  if (!s) return 0
  return parseFloat(s.replace(/[^0-9.]/g, '')) || 0
}

// Find all amount-like tokens in a string and return them in order
function findAmounts(text: string): number[] {
  // Match Indian numbers: optional crores/lakhs with commas, decimal with 2 digits
  // Also handle split: "1,00,000. 00" or "1,00,000.00"
  const normalized = text.replace(/(\d)\.\s+(\d{2})\b/g, '$1.$2')
  const re = /\b\d{1,3}(?:,\d{2,3})*\.\d{2}\b|\b\d+\.\d{2}\b/g
  const results: number[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(normalized)) !== null) {
    const v = parseINR(m[0])
    if (v > 0) results.push(v)
  }
  return results
}

function parseDate(s: string): string {
  if (!s) return ''
  // "01/Apr/2026" or "01/Apr/20" + "26"
  const m1 = s.match(/(\d{2})\/([A-Za-z]{3})\/(\d{4})/)
  if (m1) {
    const months: Record<string, string> = {
      Jan:'01',Feb:'02',Mar:'03',Apr:'04',May:'05',Jun:'06',
      Jul:'07',Aug:'08',Sep:'09',Oct:'10',Nov:'11',Dec:'12',
    }
    const mon = months[m1[2]] || '01'
    return `${m1[3]}-${mon}-${m1[1]}`
  }
  // "01-Apr-2026"
  const m2 = s.match(/(\d{2})-([A-Za-z]{3})-(\d{4})/)
  if (m2) {
    const months: Record<string, string> = {
      Jan:'01',Feb:'02',Mar:'03',Apr:'04',May:'05',Jun:'06',
      Jul:'07',Aug:'08',Sep:'09',Oct:'10',Nov:'11',Dec:'12',
    }
    const mon = months[m2[2]] || '01'
    return `${m2[3]}-${mon}-${m2[1]}`
  }
  return ''
}

interface TxnRow {
  si: number
  tranId: string
  txnDate: string      // YYYY-MM-DD
  remarks: string
  withdrawal: number   // Dr
  deposit: number      // Cr
  balance: number
  mode: string
}

function parseBankStatement(text: string): { rows: TxnRow[]; debug: string; flatSample: string } {
  // Normalise: collapse whitespace sequences but keep newlines as spaces
  const flat = text.replace(/\r?\n/g, ' ').replace(/\s{2,}/g, ' ')

  // Find transaction boundaries: integer SI followed by S<digits> (possibly split by a space)
  // and a value date DD/Mon/YY or DD/Mon/YYYY
  const boundaryRe = /\b(\d{1,3})\s+(S\d{3,}\s*\d*)\s+(\d{2}\/[A-Za-z]{3}\/\d{2,4})\s*/g

  const boundaries: Array<{
    si: number; tranId: string; dateStr: string; start: number; contentStart: number
  }> = []

  let lastSi = 0
  let m: RegExpExecArray | null
  while ((m = boundaryRe.exec(flat)) !== null) {
    const si = parseInt(m[1], 10)
    // Accept: first transaction (si=1), next in sequence, or resuming after a
    // small gap (page breaks can re-emit header rows that consume SI numbers)
    // Also accept if si > lastSi to handle any numbering gap gracefully
    // Accept ascending SI numbers; allow gaps up to 20 for page-break re-headers
    // but reject large jumps that are likely false matches in account numbers etc.
    if (lastSi === 0 ? si === 1 : (si > lastSi && si <= lastSi + 20)) {
      boundaries.push({
        si,
        tranId: m[2],
        dateStr: m[3],
        start: m.index,
        contentStart: m.index + m[0].length,
      })
      lastSi = si
    }
  }

  const rows: TxnRow[] = []

  for (let i = 0; i < boundaries.length; i++) {
    const cur = boundaries[i]
    const next = boundaries[i + 1]
    // Block: from after the boundary match up to the next boundary start
    const block = flat.slice(cur.contentStart, next ? next.start : flat.length)

    // Date: try to get the transaction date (second date in the block, DD/Mon/YYYY)
    const allDates = [...block.matchAll(/\d{2}\/[A-Za-z]{3}\/\d{4}/g)]
    let txnDate = parseDate(cur.dateStr)
    // First date in block is usually Transaction Date (full year)
    if (allDates.length > 0) {
      const d = parseDate(allDates[0][0])
      if (d) txnDate = d
    }

    // Amounts: scan block for Indian-format numbers
    const amounts = findAmounts(block)
    if (amounts.length < 1) continue

    // Last amount is balance. First is the transaction amount.
    const txnAmount = amounts[0]
    const balance = amounts[amounts.length - 1]

    // Determine remarks: strip dates, amounts, times from block
    let remarks = block
      .replace(/\d{2}\/[A-Za-z]{3}\/\d{4}/g, '')
      .replace(/\d{2}-[A-Za-z]{3}-\d{4}\s+\d{2}:\d{2}:\d{2}\s*[AP]M/gi, '')
      .replace(/\d{2}-[A-Za-z]{3}-\d{4}/g, '')
      .replace(/\d{2}:\d{2}:\d{2}\s*[AP]M/gi, '')
      .replace(/\b\d{1,3}(?:,\d{2,3})*\.\d{2}\b/g, '')
      .replace(/\s{2,}/g, ' ')
      .trim()

    // Mode from remarks prefix
    const ru = remarks.toUpperCase()
    let mode = 'OTHER'
    if (ru.startsWith('UPI')) mode = 'UPI'
    else if (ru.startsWith('NEFT') || ru.startsWith('NEFTCNRB') || ru.includes('INF/NEFT') || ru.includes('INF/INFT')) mode = 'NEFT'
    else if (ru.startsWith('RTGS') || ru.includes('RTGS/')) mode = 'RTGS'
    else if (ru.startsWith('MMT') || ru.startsWith('IMPS')) mode = 'IMPS'

    // Determine Dr vs Cr
    // Cr transactions visible in this DR-filtered statement:
    //   NEFT-RETURN*, RTGS RETURN*, RTGSCNRBR*, NEFTCNRBH* (Sarvani credits),
    //   any remarks containing "SARVANI BIO FUELS"
    const isCredit =
      /NEFT.?RETURN/i.test(remarks) ||
      /RTGS.?RETURN/i.test(remarks) ||
      /RTGSCNRBR/i.test(remarks) ||
      /SARVANI BIO FUELS/i.test(remarks) ||
      // NEFTCNRBH = inward NEFT credit from Canara Bank (Sarvani's bank)
      // BUT only when it's a deposit — distinguish by checking if remarks
      // contains "-SARVANI" pattern
      (/NEFTCNRBH/i.test(remarks) && /SARVANI/i.test(remarks))

    rows.push({
      si: cur.si,
      tranId: cur.tranId,
      txnDate,
      remarks: remarks.slice(0, 300),
      withdrawal: isCredit ? 0 : txnAmount,
      deposit: isCredit ? txnAmount : 0,
      balance,
      mode,
    })
  }

  return {
    rows,
    debug: flat.slice(0, 3000),
    flatSample: flat.slice(3000, 6000),
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsResponse()

  const { user, response: authResponse } = await requireAuth(req)
  if (authResponse) return authResponse

  if (req.method !== 'POST') return error('Method not allowed', 405)

  const contentType = req.headers.get('content-type') || ''
  let bytes: Uint8Array

  try {
    if (contentType.includes('multipart/form-data')) {
      const form = await req.formData()
      const file = form.get('file') as File | null
      if (!file) return error('No file uploaded', 400)
      bytes = new Uint8Array(await file.arrayBuffer())
    } else {
      bytes = new Uint8Array(await req.arrayBuffer())
    }

    const text = await extractPdfText(bytes)
    const { rows, debug, flatSample } = parseBankStatement(text)

    return json({ rows, count: rows.length, debug, flatSample })
  } catch (e: any) {
    return error(`Parse failed: ${e?.message ?? e}`, 500)
  }
})
