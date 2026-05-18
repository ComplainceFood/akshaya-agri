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

  // ICICI's PDF wraps narrow columns. The SI/TranID/ValueDate/TxnDate columns
  // are printed vertically next to each other, and unpdf serialises them
  // top-to-bottom across the row, which interleaves fragments. Examples seen:
  //
  //   "1 S4987 01/Apr/20 01/Apr/2026 01-Apr-2026 09:46:39 AM ... 083 26"
  //   "212 S6838 09/May/2 09/May/2026 09-May-2026 11:52:36 AM ... 7041 026"
  //
  // The fragments we need to re-glue (in order) are:
  //   * TranID:   "S<4 digits>" + "<rest digits 2-4>"
  //   * ValueDate: "DD/Mon/<short year>" + "<rest of year>"
  //   * (TxnDate uses the same shape but is usually printed in full)
  //
  // We perform the gluing in two passes: first repair dates with short years,
  // then merge orphan TranID-tail digits that appear right after the posted
  // datetime block.

  // Pass 1: glue split short-year date "01/May/2" + "026" → "01/May/2026"
  flat = flat.replace(/(\d{2}\/[A-Za-z]{3,9}\/\d{1,3})\s+(\d{1,3})(?=\D)/g, (m, a, b) => {
    const combined = a + b
    return /\/\d{4}$/.test(combined) ? combined : m
  })

  // Pass 2: glue split posted datetime "01-Apr-202" + "6 09:46:39 AM" → "01-Apr-2026 09:46:39 AM"
  flat = flat.replace(/(\d{2}-[A-Za-z]{3,9}-\d{1,3})\s+(\d{1,3})\s+(\d{2}:\d{2}:\d{2}\s*[AP]M)/g,
    (m, a, b, t) => /\d{4}$/.test(a + b) ? `${a}${b} ${t}` : m)

  // Normalise split amounts up front
  const flatFixed = normaliseAmounts(flat)

  // ── Strategy: anchor on POSTED DATETIME (DD-Mon-YYYY HH:MM:SS AM/PM) ──
  // It appears exactly once per transaction and is the most stable token in
  // the row. From each posted-datetime position we walk BACKWARDS to find
  // the SI / TranID / ValueDate (which may be in fragments), and walk
  // FORWARDS to the next posted-datetime to find the row's remarks + amounts.

  const postedDtRe = /(\d{2})-([A-Za-z]{3,9})-(\d{4})\s+(\d{2}:\d{2}:\d{2}\s*[AP]M)/gi
  const posted: Array<{ index: number; length: number; isoDate: string }> = []
  let pm: RegExpExecArray | null
  while ((pm = postedDtRe.exec(flatFixed)) !== null) {
    const mon = MONTHS[pm[2]] || MONTHS[pm[2].slice(0, 3)] || '01'
    posted.push({
      index: pm.index,
      length: pm[0].length,
      isoDate: `${pm[3]}-${mon}-${pm[1]}`,
    })
  }

  // ── Anchor on each posted datetime directly ──
  // Build one row per posted-datetime. The row's content is the slice
  // [thisPosted.end, nextPosted.start). We find the header (SI + TranID)
  // by scanning BACKWARDS from the posted datetime — the closest preceding
  // "<si> S<digits>" pair is this row's. Tail digits that belong to the
  // TranID/year are stitched on by gluing fragments.

  const rows: TxnRow[] = []
  const seenTranIds = new Set<string>()
  // Strict S-id regex: at least 3 digits, optionally followed by a tail fragment
  const sIdNear = /(\d{1,4})\s+(S\d{3,})(?:\s+(\d{1,5}))?/g

  for (let i = 0; i < posted.length; i++) {
    const cur = posted[i]
    const next = posted[i + 1]

    // Search window for THIS row's header: from previous posted dt end up to
    // this posted dt. We deliberately do NOT clamp to the previous row's
    // tail because PDF fragmentation can place the header earlier.
    const headerWindowStart = i > 0 ? posted[i - 1].index + posted[i - 1].length : 0
    const headerWindow = flatFixed.slice(headerWindowStart, cur.index)

    // POST-block: text after this posted dt, up to next posted dt (or end).
    // Contains remarks + amounts + (possibly) next row's header fragments.
    const postEnd = next ? next.index : flatFixed.length
    const postBlock = flatFixed.slice(cur.index + cur.length, postEnd)

    // Find ALL <digits> S<digits> [tail] candidates in the header window.
    // Take the LAST one — that's the closest to this posted datetime.
    const cands: Array<{ si: number; tranId: string; idx: number; matchLen: number }> = []
    let cm: RegExpExecArray | null
    sIdNear.lastIndex = 0
    while ((cm = sIdNear.exec(headerWindow)) !== null) {
      const si = parseInt(cm[1], 10)
      if (si < 1 || si > 9999) continue
      let tranId = cm[2]
      if (cm[3]) tranId += cm[3]
      cands.push({ si, tranId, idx: cm.index, matchLen: cm[0].length })
    }
    if (cands.length === 0) continue
    const header = cands[cands.length - 1]
    const { si, tranId } = header

    // De-dupe: same TranID seen earlier in this run means page-break reprint
    if (seenTranIds.has(tranId)) continue

    // ── Transaction date: prefer full DD/Mon/YYYY in headerWindow after the
    // header position; else fall back to posted-dt date ──
    let txnDate = cur.isoDate
    const afterHeader = headerWindow.slice(header.idx + header.matchLen)
    const dateMatches = [...afterHeader.matchAll(/\d{2}\/[A-Za-z]{3,9}\/\d{4}/g)]
    if (dateMatches.length > 0) {
      const d = parseDate(dateMatches[0][0])
      if (d) txnDate = d
    }

    // ── Find amounts in postBlock ──
    // The last 2 .dd values are [txnAmount, balance]. Anything past them
    // (the next row's header digits) doesn't contain ".dd" so it's filtered.
    // Page-break: same balance may repeat — dedupe consecutive duplicates.
    const rawAmounts = findAmounts(postBlock)
    const amounts: number[] = []
    for (const a of rawAmounts) {
      if (amounts.length === 0 || amounts[amounts.length - 1] !== a) amounts.push(a)
    }
    if (amounts.length < 2) continue

    const balance = amounts[amounts.length - 1]
    const txnAmount = amounts[amounts.length - 2]

    // ── Remarks: from first mode keyword in postBlock, stripped of amounts
    // and any trailing next-row header fragments ──
    let remarks = postBlock
    const modeStart = remarks.search(/\b(UPI|NEFT|RTGS|MMT|IMPS|INF)\b/i)
    if (modeStart >= 0) remarks = remarks.slice(modeStart)
    // Cut off anything that looks like a trailing next-row header
    const tailHeaderCut = remarks.search(/\s\d{1,4}\s+S\d{3,}(?:\s|$)/)
    if (tailHeaderCut > 0) remarks = remarks.slice(0, tailHeaderCut)
    remarks = remarks
      .replace(/\d{1,3}(?:,?\d{2,3})*\.\d{2}/g, '')
      .replace(/\s{2,}/g, ' ')
      .trim()

    // Mode classification
    const ru = remarks.toUpperCase()
    let mode = 'OTHER'
    if (/^UPI/.test(ru)) mode = 'UPI'
    else if (/^(NEFT|NEFTCNRB)/.test(ru) || /INF\/(NEFT|INFT)/.test(ru)) mode = 'NEFT'
    else if (/^RTGS/.test(ru) || /RTGS\//.test(ru)) mode = 'RTGS'
    else if (/^(MMT|IMPS)/.test(ru)) mode = 'IMPS'

    // Dr vs Cr: ICICI inward credits come back as "NEFTCNRBH-SARVANI...",
    // "RTGSCNRBR...", or "NEFT-RETURN"/"RTGS RETURN" reversals
    const isCredit =
      /NEFT.?RETURN/i.test(remarks) ||
      /RTGS.?RETURN/i.test(remarks) ||
      /RTGSCNRBR/i.test(remarks) ||
      /SARVANI BIO FUELS/i.test(remarks) ||
      (/NEFTCNRBH/i.test(remarks) && /SARVANI/i.test(remarks))

    const { paidTo, accountRef } = extractBeneficiary(remarks)

    rows.push({
      si,
      tranId,
      txnDate,
      remarks: remarks.slice(0, 300),
      paidTo,
      accountRef,
      withdrawal: isCredit ? 0 : txnAmount,
      deposit: isCredit ? txnAmount : 0,
      balance,
      mode,
      _rawBlock: postBlock.slice(0, 400),
      _amounts: amounts,
    })
    seenTranIds.add(tranId)
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
