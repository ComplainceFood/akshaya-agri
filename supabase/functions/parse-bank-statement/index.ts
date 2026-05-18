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
  // PDF line-wrapping splits Indian amounts in two ways:
  //   A) Decimal split:    "1,60,000. 00"   (dot + space + 2 digits)
  //   B) Mid-digit split:  "1,60,00 00.00"  (last digit group wraps to next line)
  //      Real value: 1,60,000.00 — the "0" before the dot landed on the next line
  const normalized = text
    // Fix A: glue "NNN. DD" → "NNN.DD"
    .replace(/(\d)\.\s+(\d{2})\b/g, '$1.$2')
    // Fix B: "digits/commas SPACE digits.dd" where first part ends mid-group
    // e.g. "1,60,00 00.00" → "1,60,0000.00" then the regex below still parses it
    // More precisely: a comma-number fragment followed by space + digits + ".dd"
    .replace(/((?:\d{1,3},)+\d{0,3})\s+(\d{1,3}\.\d{2})\b/g, '$1$2')

  const re = /\b\d{1,3}(?:,\d{2,3})*\d*\.\d{2}\b|\b\d+\.\d{2}\b/g
  const results: number[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(normalized)) !== null) {
    const v = parseINR(m[0])
    if (v > 0) results.push(v)
  }
  return results
}

const MONTHS: Record<string, string> = {
  Jan:'01', January:'01', Feb:'02', February:'02', Mar:'03', March:'03',
  Apr:'04', April:'04', May:'05', Jun:'06', June:'06',
  Jul:'07', July:'07', Aug:'08', August:'08', Sep:'09', September:'09',
  Oct:'10', October:'10', Nov:'11', November:'11', Dec:'12', December:'12',
}

function parseDate(s: string): string {
  if (!s) return ''
  const m1 = s.match(/(\d{2})\/([A-Za-z]{3,9})\/(\d{4})/)
  if (m1) {
    const mon = MONTHS[m1[2]] || MONTHS[m1[2].slice(0,3)] || '01'
    return `${m1[3]}-${mon}-${m1[1]}`
  }
  const m2 = s.match(/(\d{2})-([A-Za-z]{3,9})-(\d{4})/)
  if (m2) {
    const mon = MONTHS[m2[2]] || MONTHS[m2[2].slice(0,3)] || '01'
    return `${m2[3]}-${mon}-${m2[1]}`
  }
  return ''
}

interface TxnRow {
  si: number
  tranId: string
  txnDate: string      // YYYY-MM-DD
  remarks: string
  paidTo: string       // extracted beneficiary name from remarks
  accountRef: string   // account number or UPI VPA
  withdrawal: number   // Dr
  deposit: number      // Cr
  balance: number
  mode: string
}

// Parse the structured remarks string into paidTo and accountRef.
// ICICI remarks format by mode:
//   MMT/IMPS/<acctNo>/<ref>/<BeneficiaryName>/<IFSC>
//   UPI/<txnRef>/<desc>/<VPA or Name>
//   NEFT/<ref>/<acctNo>/<IFSC>/<extra>/<BeneficiaryName>
//   RTGS/<ref>/<acctNo>/<IFSC>/<extra>/<BeneficiaryName>
//   INF/NEFT/<ref>/<acctNo>/<IFSC>/<extra>/<BeneficiaryName>
//   NEFT- CNRBH<ref>/<BeneficiaryName>  (inward)
function extractBeneficiary(remarks: string): { paidTo: string; accountRef: string } {
  // Normalise spaces inside tokens that got split by PDF (e.g. "UBIN0 800279" → "UBIN0800279")
  const r = remarks.replace(/([A-Z0-9])\s+([0-9]{3,})/g, '$1$2').trim()
  const parts = r.split('/')

  const isIFSC = (s: string) => /^[A-Z]{4}0[A-Z0-9]{6}$/i.test(s.trim())
  const isDigits = (s: string) => /^\d{6,}$/.test(s.trim())

  const mode = parts[0]?.toUpperCase() || ''

  if (/^(MMT|IMPS)/.test(mode)) {
    // MMT/IMPS / <acctNo> / <ref> / <name> / <IFSC>
    const acct = parts[1]?.trim() || ''
    // name is the last non-IFSC, non-digit part before IFSC
    let name = ''
    for (let i = parts.length - 1; i >= 2; i--) {
      const p = parts[i].trim()
      if (isIFSC(p) || isDigits(p)) continue
      name = p; break
    }
    return { paidTo: name, accountRef: acct }
  }

  if (/^UPI/.test(mode)) {
    // UPI / <txnRef> / <desc> / <VPA or name>
    const last = parts[parts.length - 1]?.trim() || ''
    const secondLast = parts.length >= 3 ? parts[parts.length - 2]?.trim() : ''
    // prefer VPA (contains @) else last non-empty part
    const name = last.includes('@') ? last : (last || secondLast)
    const acct = parts[1]?.trim() || ''
    return { paidTo: name, accountRef: acct }
  }

  if (/^(NEFT|RTGS|INF)/.test(mode)) {
    // NEFT / <ref> / <acctNo> / <IFSC> / ... / <name>
    // OR inward: NEFT- CNRBH<ref> / <name>
    let name = ''
    let acct = ''
    for (let i = 1; i < parts.length; i++) {
      const p = parts[i].trim()
      if (isDigits(p)) { if (!acct) acct = p; continue }
      if (isIFSC(p)) continue
      if (p && !name) name = p  // first non-digit non-IFSC = name (inward)
    }
    // For outward NEFT/RTGS the name is usually the last slash segment
    const lastPart = parts[parts.length - 1]?.trim()
    if (lastPart && !isIFSC(lastPart) && !isDigits(lastPart)) name = lastPart
    return { paidTo: name, accountRef: acct }
  }

  return { paidTo: '', accountRef: '' }
}

function parseBankStatement(text: string): { rows: TxnRow[]; debug: string; flatSample: string } {
  // Normalise: collapse whitespace sequences but keep newlines as spaces
  const flat = text.replace(/\r?\n/g, ' ').replace(/\s{2,}/g, ' ')

  // Find transaction boundaries: integer SI followed by S<digits> (possibly split by a space)
  // and a value date DD/Mon/YY or DD/Mon/YYYY
  // Value date may be split across PDF fragments: "01/May/2" + "026" → normalise first
  const flatFixed = flat.replace(/(\d{2}\/[A-Za-z]{3,9}\/\d{1,3})\s+(\d{1,3})\b/g, (_, a, b) => {
    // Only glue if combined year looks like 2-4 digits (e.g. "2"+"026" → "2026")
    const combined = a + b
    if (/\/\d{2,4}$/.test(combined)) return combined
    return _ // leave as-is
  })
  const boundaryRe = /\b(\d{1,3})\s+(S\d{3,}\s*\d*)\s+(\d{2}\/[A-Za-z]{3,9}\/\d{2,4})\s*/g

  const boundaries: Array<{
    si: number; tranId: string; dateStr: string; start: number; contentStart: number
  }> = []

  let lastSi = 0
  let m: RegExpExecArray | null
  while ((m = boundaryRe.exec(flatFixed)) !== null) {
    const si = parseInt(m[1], 10)
    // Accept: first transaction (si=1), next in sequence, or resuming after a
    // small gap (page breaks can re-emit header rows that consume SI numbers)
    // Also accept if si > lastSi to handle any numbering gap gracefully
    // Accept ascending SI numbers; allow gaps up to 20 for page-break re-headers
    // but reject large jumps that are likely false matches in account numbers etc.
    if (si > lastSi) {
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
    const block = flatFixed.slice(cur.contentStart, next ? next.start : flatFixed.length)

    // Date: try to get the transaction date (second date in the block, DD/Mon/YYYY)
    const allDates = [...block.matchAll(/\d{2}\/[A-Za-z]{3,9}\/\d{4}/g)]
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

    // Remarks: the actual transaction description starts after the posted datetime
    // Block layout: [TxnDate DD/Mon/YYYY] [PostedDate DD-Mon-YYYY HH:MM:SS AM/PM] [ChequeRef] [Remarks...] [Amount] [Balance]
    // Extract text after the posted datetime to skip the cheque/ref field noise
    let remarks = ''
    const postedDtMatch = block.match(/\d{2}-[A-Za-z]{3}-\d{4}\s+\d{2}:\d{2}:\d{2}\s*[AP]M/i)
    if (postedDtMatch) {
      const afterPosted = block.slice((postedDtMatch.index ?? 0) + postedDtMatch[0].length).trim()
      // Skip cheque/ref: a hex string or alphanumeric ref before the first known mode keyword
      // Remarks start at UPI/NEFT/RTGS/MMT/IMPS/INF or first slash-delimited token
      const modeStart = afterPosted.search(/\b(UPI|NEFT|RTGS|MMT|IMPS|INF)\b/i)
      remarks = modeStart >= 0 ? afterPosted.slice(modeStart) : afterPosted
    }
    // Fallback: strip all dates/times/amounts from whole block
    if (!remarks.trim()) {
      remarks = block
        .replace(/\d{2}\/[A-Za-z]{3,9}\/\d{4}/g, '')
        .replace(/\d{2}-[A-Za-z]{3}-\d{4}\s+\d{2}:\d{2}:\d{2}\s*[AP]M/gi, '')
        .replace(/\d{2}-[A-Za-z]{3}-\d{4}/g, '')
        .replace(/\d{2}:\d{2}:\d{2}\s*[AP]M/gi, '')
    }
    // Strip trailing amounts and whitespace
    remarks = remarks
      .replace(/\b\d{1,3}(?:,\d{2,3})*\.\d{2}\b/g, '')
      .replace(/\s{2,}/g, ' ')
      .trim()

    // Mode from remarks prefix
    const ru = remarks.toUpperCase()
    let mode = 'OTHER'
    if (/^UPI/.test(ru)) mode = 'UPI'
    else if (/^(NEFT|NEFTCNRB)/.test(ru) || /INF\/(NEFT|INFT)/.test(ru)) mode = 'NEFT'
    else if (/^RTGS/.test(ru) || /RTGS\//.test(ru)) mode = 'RTGS'
    else if (/^(MMT|IMPS)/.test(ru)) mode = 'IMPS'

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

    const { paidTo, accountRef } = extractBeneficiary(remarks)

    rows.push({
      si: cur.si,
      tranId: cur.tranId,
      txnDate,
      remarks: remarks.slice(0, 300),
      paidTo,
      accountRef,
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
