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

// Extract text per-page so page-break artefacts (footers/headers like "Page 3 of 13",
// repeated column headers) don't merge into the middle of a transaction row.
async function extractPdfPages(bytes: Uint8Array): Promise<string[]> {
  // @ts-ignore
  const { extractText } = await import('https://esm.sh/unpdf@0.11.0')
  const result = await extractText(bytes, { mergePages: false })
  if (Array.isArray(result)) return result.map(String)
  if (result?.text && Array.isArray(result.text)) return result.text.map(String)
  if (typeof result?.text === 'string') return [result.text]
  if (result?.pages) return (result.pages as string[]).map(String)
  if (typeof result === 'string') return [result]
  return [String(result)]
}

// Strip per-page boilerplate: page numbers, repeated column headers, statement
// metadata that appears at the top/bottom of each page and would otherwise leak
// into the middle of a transaction row when pages are concatenated.
function stripPageBoilerplate(pageText: string): string {
  return pageText
    // "Page 3 of 13" or "Page 3 of13" (no space)
    .replace(/Page\s*\d+\s*of\s*\d+/gi, ' ')
    // Repeated column header line
    .replace(/SI\s*No\.?\s*Tran(?:saction)?\s*Id.*?Balance/gi, ' ')
    // Withdrawal/Deposit/Balance header sequence
    .replace(/Withdrawal\s*\(?Dr\)?\s*Deposit\s*\(?Cr\)?\s*Balance/gi, ' ')
    // Statement period line
    .replace(/Statement\s*Period\s*:?[^\n]{0,80}/gi, ' ')
    // Customer info repeated on each page (cust name, address)
    .replace(/Account\s*Number\s*:?\s*\d+/gi, ' ')
    .replace(/Customer\s*Name\s*:?[^\n]{0,80}/gi, ' ')
    // Generated-on timestamps (look like posted-dt but aren't transactions)
    .replace(/(Generated|Printed|Downloaded)\s*on\s*:?\s*\d{1,2}[-\/][A-Za-z]{3,9}[-\/]\d{2,4}\s+\d{2}:\d{2}:\d{2}\s*[AP]M/gi, ' ')
}

async function extractPdfText(bytes: Uint8Array): Promise<string> {
  const pages = await extractPdfPages(bytes)
  return pages.map(stripPageBoilerplate).join(' ')
}

// Parse Indian-formatted amount strings like "1,00,000.00" or "1,00,000. 00"
function parseINR(s: string): number {
  if (!s) return 0
  return parseFloat(s.replace(/[^0-9.]/g, '')) || 0
}

// Aggressively normalise split Indian amounts. PDF rendering breaks numbers in
// many ways depending on column width and line wrapping. Apply multiple passes
// from most-specific (least likely to cause false matches) to most-permissive.
function normaliseAmounts(text: string): string {
  let t = text
  // Pass A: glue split around comma — "1,60, 000.00" or "1,60 ,000.00" → "1,60,000.00"
  t = t.replace(/(\d),\s+(\d)/g, '$1,$2')
  t = t.replace(/(\d)\s+,(\d)/g, '$1,$2')
  // Pass B: glue decimal split — "1,60,000. 00" → "1,60,000.00"
  t = t.replace(/(\d)\.\s+(\d{2})(?!\d)/g, '$1.$2')
  // Pass C: glue mid-digit-group split — "1,60,00 00.00" → "1,60,0000.00"
  // Pattern: digits/commas (no trailing dot), space, then digits + ".dd"
  // The left side must contain a comma (otherwise it's just two unrelated numbers)
  t = t.replace(/(\d{1,3}(?:,\d{1,3})+)\s+(\d{1,3}\.\d{2})(?!\d)/g, '$1$2')
  return t
}

// Find all amount-like tokens in a string and return them in order.
// Accepts both Indian-grouped (1,23,456.78) and ungrouped (123456.78) numbers.
function findAmounts(text: string): number[] {
  const normalized = normaliseAmounts(text)
  // Match: any digits-with-optional-commas followed by .dd
  // The \d{1,3}(?:,?\d{2,3})* tolerates both with and without grouping
  const re = /\d{1,3}(?:,?\d{2,3})*\.\d{2}/g
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
  _rawBlock?: string   // debug: the raw text block this row was parsed from
  _amounts?: number[]  // debug: all amounts found in the block
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
  let flat = text.replace(/\r?\n/g, ' ').replace(/\s{2,}/g, ' ')

  // Fix split dates: "01/May/2" + "026" → "01/May/2026"
  flat = flat.replace(/(\d{2}\/[A-Za-z]{3,9}\/\d{1,3})\s+(\d{1,3})\b/g, (_, a, b) => {
    const combined = a + b
    if (/\/\d{2,4}$/.test(combined)) return combined
    return _
  })

  // Fix split SI numbers: "2 61 S0123456 01/May/2026" → "261 S0123456 ..."
  flat = flat.replace(/\b(\d{1,3})\s+(\d{1,2})\s+(S\d{3,})/g, '$1$2 $3')

  // Fix split Tran IDs: "S4987" + "083" → "S4987083"
  flat = flat.replace(/\b(S\d{4,})\s+(\d{2,4})\b/g, '$1$2')

  // Normalise split amounts up front
  const flatFixed = normaliseAmounts(flat)

  // ── Strategy: anchor on POSTED DATETIME (DD-Mon-YYYY HH:MM:SS AM/PM) ──
  // This appears exactly once per transaction and is highly stable.
  // For each posted-datetime position, the transaction's amounts (txn + balance)
  // are the LAST 2 numbers that appear BEFORE the NEXT posted-datetime (or end of text).
  //
  // We also need the SI/TranID/ValueDate (which appear BEFORE the posted-datetime
  // for the same row) to identify the transaction.

  const postedDtRe = /\d{2}-[A-Za-z]{3,9}-\d{4}\s+\d{2}:\d{2}:\d{2}\s*[AP]M/gi
  const postedPositions: Array<{ index: number; length: number; text: string }> = []
  let pm: RegExpExecArray | null
  while ((pm = postedDtRe.exec(flatFixed)) !== null) {
    postedPositions.push({ index: pm.index, length: pm[0].length, text: pm[0] })
  }

  // SI + TranID + ValueDate boundary regex (used to identify each row's header)
  const headerRe = /\b(\d{1,4})\s+(S\d{4,})\s+(\d{2}\/[A-Za-z]{3,9}\/\d{2,4})/g

  // Build list of all headers
  const headers: Array<{ si: number; tranId: string; dateStr: string; index: number; endIndex: number }> = []
  let hm: RegExpExecArray | null
  while ((hm = headerRe.exec(flatFixed)) !== null) {
    headers.push({
      si: parseInt(hm[1], 10),
      tranId: hm[2],
      dateStr: hm[3],
      index: hm.index,
      endIndex: hm.index + hm[0].length,
    })
  }

  // Filter headers: keep only those with ascending SI (skip header re-prints on page breaks)
  const validHeaders: typeof headers = []
  let lastSi = 0
  for (const h of headers) {
    if (h.si > lastSi && h.si < 10000) { validHeaders.push(h); lastSi = h.si }
  }

  const rows: TxnRow[] = []

  for (let i = 0; i < validHeaders.length; i++) {
    const cur = validHeaders[i]
    const next = validHeaders[i + 1]

    // The row's content ends at the START of the next header (or end of text)
    const rowEnd = next ? next.index : flatFixed.length
    // The row's content starts right after THIS row's header
    const rowStart = cur.endIndex

    // Slice the full row (header end → next header start)
    const block = flatFixed.slice(rowStart, rowEnd)

    // Find the posted datetime within this block (skip if multiple, take first)
    const postedInBlock = postedPositions.find(p => p.index >= rowStart && p.index < rowEnd)
    // Everything after the posted datetime is: ChequeRef + Remarks + TxnAmount + Balance
    const tail = postedInBlock
      ? flatFixed.slice(postedInBlock.index + postedInBlock.length, rowEnd)
      : block

    // Transaction date: first full-year DD/Mon/YYYY in the block (before posted datetime)
    const headerSection = postedInBlock ? flatFixed.slice(rowStart, postedInBlock.index) : block
    const dateMatches = [...headerSection.matchAll(/\d{2}\/[A-Za-z]{3,9}\/\d{4}/g)]
    let txnDate = parseDate(cur.dateStr)
    if (dateMatches.length > 0) {
      const d = parseDate(dateMatches[0][0])
      if (d) txnDate = d
    }

    // Amounts: the LAST 2 .dd numbers in the tail are [txnAmount, balance].
    //
    // Edge case: ICICI page-break inserts "Balance b/f" or repeats the closing
    // balance at the top of the next page. This can make the same balance value
    // appear twice in our tail (txn, balance, balance_bf). Dedupe consecutive
    // equal amounts to handle this.
    const rawAmounts = findAmounts(tail)
    const amounts: number[] = []
    for (const a of rawAmounts) {
      if (amounts.length === 0 || amounts[amounts.length - 1] !== a) amounts.push(a)
    }
    if (amounts.length < 2) continue

    const balance = amounts[amounts.length - 1]
    const txnAmount = amounts[amounts.length - 2]

    // Remarks: start at the first mode keyword in the tail (skips cheque/ref noise),
    // then strip the trailing amounts.
    let remarks = tail.trim()
    const modeStart = remarks.search(/\b(UPI|NEFT|RTGS|MMT|IMPS|INF)\b/i)
    if (modeStart >= 0) remarks = remarks.slice(modeStart)
    // Strip the trailing 2 amounts and any other .dd numbers from remarks
    remarks = remarks
      .replace(/\d{1,3}(?:,?\d{2,3})*\.\d{2}/g, '')
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
      _rawBlock: tail.slice(0, 400),
      _amounts: amounts,
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
