import { corsResponse, json, error } from '../_shared/cors.ts'
import { requireAuth } from '../_shared/auth.ts'

// ICICI Bank Detailed Statement PDF parser
//
// Strategy (mirrors the working parse-weighing-report pattern):
//   1. Pick a terminal marker that uniquely identifies each record.
//      In ICICI statements each row contains exactly one TranID (S + 9-10 digits).
//      It's the equivalent of PRODUCT+ChallanNo in the weighing report.
//   2. Locate every TranID in the flattened PDF text (after gluing fragments).
//   3. Slice the segment between consecutive markers; extract date / remarks /
//      amounts / balance from that segment by position.
//   4. Use the statement's own end-of-statement summary block (Opening Bal /
//      Withdrawls / Deposits / Closing Bal) as reconciliation: parsed totals
//      must match within rounding tolerance.

// ── PDF text extraction (per-page so headers/footers can be stripped) ────────

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

function stripPageBoilerplate(pageText: string): string {
  return pageText
    .replace(/Page\s*\d+\s*of\s*\d+/gi, ' ')
    .replace(/SI\s*No\.?\s*Tran(?:saction)?\s*Id.*?Balance/gi, ' ')
    .replace(/Withdrawal\s*\(?Dr\)?\s*Deposit\s*\(?Cr\)?\s*Balance/gi, ' ')
    .replace(/Statement\s*Period\s*:?[^\n]{0,80}/gi, ' ')
    .replace(/Account\s*Number\s*:?\s*\d+/gi, ' ')
    .replace(/Customer\s*Name\s*:?[^\n]{0,80}/gi, ' ')
    .replace(/(Generated|Printed|Downloaded)\s*on\s*:?\s*\d{1,2}[-\/][A-Za-z]{3,9}[-\/]\d{2,4}\s+\d{2}:\d{2}:\d{2}\s*[AP]M/gi, ' ')
}

async function extractPdfText(bytes: Uint8Array): Promise<string> {
  const pages = await extractPdfPages(bytes)
  return pages.map(stripPageBoilerplate).join(' ')
}

// ── Number helpers ───────────────────────────────────────────────────────────

function parseINR(s: string): number {
  if (!s) return 0
  return parseFloat(s.replace(/[^0-9.]/g, '')) || 0
}

// Re-glue Indian amounts that PDF rendering split across spaces.
function normaliseAmounts(text: string): string {
  let t = text
  // "1,60, 000.00" or "1,60 ,000.00" → "1,60,000.00"
  t = t.replace(/(\d),\s+(\d)/g, '$1,$2')
  t = t.replace(/(\d)\s+,(\d)/g, '$1,$2')
  // "1,60,000. 00" → "1,60,000.00"
  t = t.replace(/(\d)\.\s+(\d{2})(?!\d)/g, '$1.$2')
  // "1,60,00 00.00" → "1,60,0000.00" (left side must contain a comma)
  t = t.replace(/(\d{1,3}(?:,\d{1,3})+)\s+(\d{1,3}\.\d{2})(?!\d)/g, '$1$2')
  return t
}

function findAmounts(text: string): number[] {
  const normalized = normaliseAmounts(text)
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

// ── Beneficiary extraction (kept from previous version) ──────────────────────

function extractBeneficiary(remarks: string): { paidTo: string; accountRef: string } {
  const r = remarks.replace(/([A-Z0-9])\s+([0-9]{3,})/g, '$1$2').trim()
  const parts = r.split('/')
  const isIFSC = (s: string) => /^[A-Z]{4}0[A-Z0-9]{6}$/i.test(s.trim())
  const isDigits = (s: string) => /^\d{6,}$/.test(s.trim())
  const mode = parts[0]?.toUpperCase() || ''

  if (/^(MMT|IMPS)/.test(mode)) {
    const acct = parts[1]?.trim() || ''
    let name = ''
    for (let i = parts.length - 1; i >= 2; i--) {
      const p = parts[i].trim()
      if (isIFSC(p) || isDigits(p)) continue
      name = p; break
    }
    return { paidTo: name, accountRef: acct }
  }
  if (/^UPI/.test(mode)) {
    const last = parts[parts.length - 1]?.trim() || ''
    const secondLast = parts.length >= 3 ? parts[parts.length - 2]?.trim() : ''
    const name = last.includes('@') ? last : (last || secondLast)
    const acct = parts[1]?.trim() || ''
    return { paidTo: name, accountRef: acct }
  }
  if (/^(NEFT|RTGS|INF)/.test(mode)) {
    let name = ''
    let acct = ''
    for (let i = 1; i < parts.length; i++) {
      const p = parts[i].trim()
      if (isDigits(p)) { if (!acct) acct = p; continue }
      if (isIFSC(p)) continue
      if (p && !name) name = p
    }
    const lastPart = parts[parts.length - 1]?.trim()
    if (lastPart && !isIFSC(lastPart) && !isDigits(lastPart)) name = lastPart
    return { paidTo: name, accountRef: acct }
  }
  return { paidTo: '', accountRef: '' }
}

// ── Types ────────────────────────────────────────────────────────────────────

interface TxnRow {
  si: number
  tranId: string
  txnDate: string
  remarks: string
  paidTo: string
  accountRef: string
  withdrawal: number
  deposit: number
  balance: number
  mode: string
  _rawBlock?: string
  _amounts?: number[]
}

interface Summary {
  openingBalance: number
  totalWithdrawals: number
  totalDeposits: number
  closingBalance: number
}

// ── End-of-statement summary parser ──────────────────────────────────────────
//
// ICICI footer block:
//   Opening Bal   Withdrawls   Deposits   Closing Bal
//   2,26,335.50   3,45,54,519.84   3,49,46,343.52   6,18,159.18
//
// PDF flattening may interleave labels and amounts. Strategy: find the labels,
// then take the next 4 amount-shaped tokens in the trailing text.

function extractSummary(text: string): Summary | null {
  const labelRe = /Opening\s*Bal[a-z]*\s*Withdrawls?\s*Deposits?\s*Closing\s*Bal/i
  const m = text.match(labelRe)
  if (!m || m.index === undefined) return null
  const tail = text.slice(m.index + m[0].length, m.index + m[0].length + 500)
  const amts = findAmounts(tail)
  if (amts.length < 4) return null
  return {
    openingBalance: amts[0],
    totalWithdrawals: amts[1],
    totalDeposits: amts[2],
    closingBalance: amts[3],
  }
}

// ── Main parser ──────────────────────────────────────────────────────────────

function parseBankStatement(text: string): {
  rows: TxnRow[]
  summary: Summary | null
  reconciliation: {
    parsedWithdrawals: number
    parsedDeposits: number
    summaryWithdrawals: number | null
    summaryDeposits: number | null
    withdrawalsMatch: boolean
    depositsMatch: boolean
    netMatch: boolean
  }
  debug: string
  flatSample: string
} {
  // 1. Flatten & glue PDF fragmentation ─────────────────────────────────────
  let flat = text.replace(/\r?\n/g, ' ').replace(/\s{2,}/g, ' ')

  // Glue split short-year date "01/May/2" + "026" → "01/May/2026"
  flat = flat.replace(/(\d{2}\/[A-Za-z]{3,9}\/\d{1,3})\s+(\d{1,3})(?=\D)/g, (m, a, b) => {
    const combined = a + b
    return /\/\d{4}$/.test(combined) ? combined : m
  })

  // Glue split posted datetime "01-Apr-202" + "6 09:46:39 AM" → "01-Apr-2026 09:46:39 AM"
  flat = flat.replace(/(\d{2}-[A-Za-z]{3,9}-\d{1,3})\s+(\d{1,3})\s+(\d{2}:\d{2}:\d{2}\s*[AP]M)/g,
    (m, a, b, t) => /\d{4}$/.test(a + b) ? `${a}${b} ${t}` : m)

  // Glue split TranID: "S4987" + " 083" → "S4987083"
  // TranID is the row's terminal marker; if it's broken we miss the row entirely.
  // It's always S followed by 9-10 total digits. Repair any S<3-7 digits> followed
  // by a small digit run if the combined length is 9 or 10.
  flat = flat.replace(/(S\d{3,7})\s+(\d{1,5})(?=\D)/g, (m, a, b) => {
    const combined = a + b
    const digits = combined.length - 1
    return digits >= 8 && digits <= 11 ? combined : m
  })

  const flatFixed = normaliseAmounts(flat)

  // 2. Locate every TranID — the per-row terminal marker ────────────────────
  // ICICI TranIDs are S + 8-11 digits. Surrounding tokens after gluing:
  //   "<si> S<digits> <DD/Mon/YYYY> <DD/Mon/YYYY> <DD-Mon-YYYY HH:MM:SS AM/PM> ..."
  const tranIdRe = /\b(S\d{8,11})\b/g
  const markers: Array<{ index: number; length: number; tranId: string }> = []
  let tm: RegExpExecArray | null
  while ((tm = tranIdRe.exec(flatFixed)) !== null) {
    markers.push({ index: tm.index, length: tm[0].length, tranId: tm[1] })
  }

  // 3. Walk segments between markers ────────────────────────────────────────
  const rows: TxnRow[] = []
  const seenTranIds = new Set<string>()

  for (let i = 0; i < markers.length; i++) {
    const { tranId, index: mStart, length: mLen } = markers[i]
    if (seenTranIds.has(tranId)) continue  // page-break reprint

    // SI is the integer immediately before this TranID
    const before = flatFixed.slice(Math.max(0, mStart - 20), mStart)
    const siMatch = before.match(/(\d{1,4})\s*$/)
    const si = siMatch ? parseInt(siMatch[1], 10) : 0

    // Segment from end of this marker to start of next marker
    const segEnd = i + 1 < markers.length ? markers[i + 1].index : flatFixed.length
    const seg = flatFixed.slice(mStart + mLen, segEnd)

    // Trim any trailing SI digits that belong to the next row
    let segClean = seg
    const nextSiCut = segClean.search(/\s\d{1,4}\s*$/)
    if (nextSiCut > 0) segClean = segClean.slice(0, nextSiCut)

    // Transaction date: first DD/Mon/YYYY in segment (Value Date column);
    // fallback to first DD-Mon-YYYY (posted datetime).
    let txnDate = ''
    const dateSlash = segClean.match(/\d{2}\/[A-Za-z]{3,9}\/\d{4}/)
    if (dateSlash) txnDate = parseDate(dateSlash[0])
    if (!txnDate) {
      const dateDash = segClean.match(/\d{2}-[A-Za-z]{3,9}-\d{4}/)
      if (dateDash) txnDate = parseDate(dateDash[0])
    }
    if (!txnDate) continue  // not a real transaction row

    // Amounts: dedupe consecutive duplicates (page-break Balance b/f repeats)
    const rawAmounts = findAmounts(segClean)
    const amounts: number[] = []
    for (const a of rawAmounts) {
      if (amounts.length === 0 || amounts[amounts.length - 1] !== a) amounts.push(a)
    }
    if (amounts.length < 2) continue
    const balance = amounts[amounts.length - 1]
    const txnAmount = amounts[amounts.length - 2]

    // Remarks: from first mode keyword onwards, stripped of amounts
    let remarks = segClean
    const modeStart = remarks.search(/\b(UPI|NEFT|RTGS|MMT|IMPS|INF)\b/i)
    if (modeStart >= 0) remarks = remarks.slice(modeStart)
    remarks = remarks
      .replace(/\d{1,3}(?:,?\d{2,3})*\.\d{2}/g, '')
      .replace(/\s{2,}/g, ' ')
      .trim()

    const ru = remarks.toUpperCase()
    let mode = 'OTHER'
    if (/^UPI/.test(ru)) mode = 'UPI'
    else if (/^(NEFT|NEFTCNRB)/.test(ru) || /INF\/(NEFT|INFT)/.test(ru)) mode = 'NEFT'
    else if (/^RTGS/.test(ru) || /RTGS\//.test(ru)) mode = 'RTGS'
    else if (/^(MMT|IMPS)/.test(ru)) mode = 'IMPS'

    // Dr vs Cr classification: inward credits use specific prefixes/keywords
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
      _rawBlock: segClean.slice(0, 400),
      _amounts: amounts,
    })
    seenTranIds.add(tranId)
  }

  // 4. Reconciliation against end-of-statement summary ──────────────────────
  const summary = extractSummary(flatFixed)
  const parsedWithdrawals = rows.reduce((s, r) => s + r.withdrawal, 0)
  const parsedDeposits = rows.reduce((s, r) => s + r.deposit, 0)
  const near = (a: number, b: number) => Math.abs(a - b) < 1  // within 1 rupee

  const reconciliation = {
    parsedWithdrawals: +parsedWithdrawals.toFixed(2),
    parsedDeposits: +parsedDeposits.toFixed(2),
    summaryWithdrawals: summary?.totalWithdrawals ?? null,
    summaryDeposits: summary?.totalDeposits ?? null,
    withdrawalsMatch: summary ? near(parsedWithdrawals, summary.totalWithdrawals) : false,
    depositsMatch: summary ? near(parsedDeposits, summary.totalDeposits) : false,
    netMatch: summary
      ? near(
          summary.openingBalance + parsedDeposits - parsedWithdrawals,
          summary.closingBalance
        )
      : false,
  }

  return {
    rows,
    summary,
    reconciliation,
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
    const result = parseBankStatement(text)

    return json({
      rows: result.rows,
      count: result.rows.length,
      summary: result.summary,
      reconciliation: result.reconciliation,
      debug: result.debug,
      flatSample: result.flatSample,
    })
  } catch (e: any) {
    return error(`Parse failed: ${e?.message ?? e}`, 500)
  }
})
