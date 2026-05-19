import { corsResponse, json, error } from '../_shared/cors.ts'
import { requireAuth } from '../_shared/auth.ts'

// ICICI Bank Detailed Statement PDF parser
//
// Each ICICI row prints column values across multiple lines (the cell wraps).
// Example row 1 in the source PDF:
//   "1 S4987 083 01/Apr/20 26 01/Apr/2026 01-Apr-2026 09:46:39 AM UPI/... 1,00,000.00 1,26,335.50"
// fragments to reassemble:
//   SI=1, TranID="S4987"+"083"="S4987083", ValueDate="01/Apr/20"+"26",
//   TxnDate="01/Apr/2026", Posted="01-Apr-2026 09:46:39 AM"
// TranID length after S varies 7-11 digits, so we cannot use it as a marker
// regex (any short anchor matches noise). The posted-datetime "DD-Mon-YYYY HH:MM:SS AM/PM"
// is the only token that appears EXACTLY ONCE per row and survives PDF wrapping
// after a single targeted glue pass.
//
// Strategy:
//   1. Flatten PDF, glue split year fragments inside the posted-datetime
//      ("01-Apr-202" + "6 09:46:39 AM" → "01-Apr-2026 09:46:39 AM").
//   2. Find every posted-datetime. Each is one row.
//   3. The row's content runs from the previous posted-datetime's end up to
//      the NEXT posted-datetime's start. SI + TranID + ValueDate live in the
//      part BEFORE this datetime (within that window); remarks + amounts + balance
//      live AFTER this datetime up to the next one.
//   4. Use the statement's own end-of-statement summary block (Opening Bal /
//      Withdrawls / Deposits / Closing Bal) as reconciliation.

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

  // Glue split posted datetime "01-Apr-202" + "6 09:46:39 AM" → "01-Apr-2026 09:46:39 AM"
  // This is the ONE glue pass that matters - posted-datetime is our row anchor.
  flat = flat.replace(/(\d{2}-[A-Za-z]{3,9}-\d{1,3})\s+(\d{1,3})\s+(\d{2}:\d{2}:\d{2}\s*[AP]M)/g,
    (m, a, b, t) => /\d{4}$/.test(a + b) ? `${a}${b} ${t}` : m)

  // Glue split short-year value date "01/May/2" + "026" → "01/May/2026"
  flat = flat.replace(/(\d{2}\/[A-Za-z]{3,9}\/\d{1,3})\s+(\d{1,3})(?=\D)/g, (m, a, b) => {
    const combined = a + b
    return /\/\d{4}$/.test(combined) ? combined : m
  })

  const flatFixed = normaliseAmounts(flat)

  // 2. Find every posted-datetime - one per row ─────────────────────────────
  const postedRe = /\b(\d{2})-([A-Za-z]{3,9})-(\d{4})\s+(\d{2}:\d{2}:\d{2})\s*([AP]M)\b/g
  const posted: Array<{ index: number; length: number; isoDate: string }> = []
  let pm: RegExpExecArray | null
  while ((pm = postedRe.exec(flatFixed)) !== null) {
    const mon = MONTHS[pm[2]] || MONTHS[pm[2].slice(0, 3)] || '01'
    posted.push({
      index: pm.index,
      length: pm[0].length,
      isoDate: `${pm[3]}-${mon}-${pm[1]}`,
    })
  }

  // 3. For each posted-datetime, extract one row ────────────────────────────
  // PRE window  = [prev posted end, this posted start)  → contains SI, TranID, ValueDate, TxnDate
  // POST window = [this posted end, next posted start)  → contains remarks + Dr/Cr amount + balance
  //   (the SI + TranID at the tail of POST belong to the NEXT row)
  const rows: TxnRow[] = []
  const seenTranIds = new Set<string>()

  for (let i = 0; i < posted.length; i++) {
    const cur = posted[i]
    const next = posted[i + 1]
    const prev = posted[i - 1]

    const preStart = prev ? prev.index + prev.length : 0
    const pre = flatFixed.slice(preStart, cur.index)
    const post = flatFixed.slice(cur.index + cur.length, next ? next.index : flatFixed.length)

    // ── SI + TranID from PRE window ──
    // PRE shape (after gluing):  "... <si> S<digits...possibly with spaces> <DD/Mon/YYYY> <DD/Mon/YYYY> "
    // We want: the LAST "<si> S<digits>(+ optional fragment runs)" before any date in PRE.
    //
    // First, strip trailing date tokens from PRE so the regex's $ aligns to TranID territory.
    let preTrim = pre
    // Drop any trailing run of "DD/Mon/YYYY" or partial year fragments
    preTrim = preTrim.replace(/\s*(\d{2}\/[A-Za-z]{3,9}\/\d{4}|\d{2}\/[A-Za-z]{3,9}\/\d{1,3}|\d{1,3})\s*$/g, '')

    // Match: <si> S<digits> [optional space-separated tail digits]
    // Tail digits collected until something non-digit / non-space appears
    const headerMatch = preTrim.match(/(\d{1,4})\s+(S\d{3,11})((?:\s+\d{1,6})*)\s*$/)
    let si = 0
    let tranId = ''
    if (headerMatch) {
      si = parseInt(headerMatch[1], 10)
      tranId = headerMatch[2] + (headerMatch[3] || '').replace(/\s+/g, '')
    } else {
      // Fallback: any S\d+ near end of PRE
      const fallback = preTrim.match(/(?:^|\s)(\d{1,4})?\s*(S\d{4,11})\s*$/)
      if (fallback) {
        si = fallback[1] ? parseInt(fallback[1], 10) : 0
        tranId = fallback[2]
      }
    }

    // Validate TranID - must be S + at least 4 digits to count as real row
    if (!tranId || !/^S\d{4,}$/.test(tranId)) continue

    // De-dupe: page-break reprints emit the same posted-datetime + TranID twice
    if (seenTranIds.has(tranId)) continue

    // ── Transaction date: prefer DD/Mon/YYYY from PRE (Value Date column), else posted ──
    let txnDate = cur.isoDate
    const dateInPre = pre.match(/\d{2}\/[A-Za-z]{3,9}\/\d{4}/)
    if (dateInPre) {
      const d = parseDate(dateInPre[0])
      if (d) txnDate = d
    }

    // ── POST window: cut off the next row's header (next "<si> S<digits>") ──
    // The next row's SI + TranID start appearing in POST after the amounts.
    // Cut at the first standalone "S\d{3,}" preceded by a small int (next SI).
    let postClean = post
    const nextHeaderCut = postClean.search(/\s\d{1,4}\s+S\d{3,}/)
    if (nextHeaderCut > 0) postClean = postClean.slice(0, nextHeaderCut)

    // ── Amounts: last two .dd values are [txnAmount, balance] ──
    // De-dupe consecutive duplicates (page-break Balance b/f leak)
    const rawAmounts = findAmounts(postClean)
    const amounts: number[] = []
    for (const a of rawAmounts) {
      if (amounts.length === 0 || amounts[amounts.length - 1] !== a) amounts.push(a)
    }
    if (amounts.length < 2) continue
    const balance = amounts[amounts.length - 1]
    const txnAmount = amounts[amounts.length - 2]

    // ── Remarks: from first mode keyword onwards, stripped of amounts ──
    let remarks = postClean
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

    // Dr vs Cr classification - inward credits have specific prefixes
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
      _rawBlock: postClean.slice(0, 400),
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

// ── Excel / CSV parsing ──────────────────────────────────────────────────────
//
// Strategy: convert sheet → array-of-arrays, find the header row by looking
// for known column-name keywords, then map each subsequent row.
//
// First attempt ICICI's exact column layout:
//   S No | Tran Id | Value Date | Transaction Date | Transaction Posted |
//   Cheque no | Description | Cr/Dr | Transaction Amount(INR) | Available Balance(INR)
// Fall back to generic detection: find Date / Description-or-Narration /
// Withdrawal-or-Debit / Deposit-or-Credit / Balance columns regardless of order.

const HEADER_ALIASES = {
  date: ['transaction date', 'txn date', 'value date', 'date', 'posting date', 'tran date'],
  posted: ['transaction posted', 'posted on', 'posted date'],
  tranId: ['tran id', 'transaction id', 'ref no', 'reference no', 'cheque no', 'instrument id'],
  description: ['description', 'narration', 'remarks', 'particulars', 'transaction details'],
  crDr: ['cr/dr', 'cr / dr', 'dr/cr', 'type'],
  amount: ['transaction amount(inr)', 'transaction amount', 'amount', 'amount (inr)', 'amt'],
  withdrawal: ['withdrawal', 'withdrawal amount', 'withdrawal(inr)', 'withdrawal amt', 'debit', 'debit amount', 'debit(inr)', 'dr amount', 'dr'],
  deposit: ['deposit', 'deposit amount', 'deposit(inr)', 'deposit amt', 'credit', 'credit amount', 'credit(inr)', 'cr amount', 'cr'],
  balance: ['available balance(inr)', 'available balance', 'balance', 'balance(inr)', 'running balance', 'closing balance'],
} as const

type HeaderKey = keyof typeof HEADER_ALIASES

function normaliseHeader(s: any): string {
  return String(s ?? '').toLowerCase().replace(/\s+/g, ' ').trim()
}

function findColumnIndex(headerRow: any[], key: HeaderKey): number {
  const aliases = HEADER_ALIASES[key]
  const headers = headerRow.map(normaliseHeader)
  for (const alias of aliases) {
    const idx = headers.indexOf(alias)
    if (idx >= 0) return idx
  }
  // Loose contains match as fallback
  for (let i = 0; i < headers.length; i++) {
    for (const alias of aliases) {
      if (headers[i] && headers[i].includes(alias)) return i
    }
  }
  return -1
}

function findHeaderRow(rows: any[][]): { headerIdx: number; map: Partial<Record<HeaderKey, number>> } | null {
  // Scan first 30 rows for one that has at least Date + (Amount OR Withdrawal/Deposit) + Description
  for (let i = 0; i < Math.min(rows.length, 30); i++) {
    const r = rows[i]
    if (!r || r.length < 3) continue
    const map: Partial<Record<HeaderKey, number>> = {}
    for (const key of Object.keys(HEADER_ALIASES) as HeaderKey[]) {
      const idx = findColumnIndex(r, key)
      if (idx >= 0) map[key] = idx
    }
    const hasDate = map.date !== undefined
    const hasAmount = map.amount !== undefined || (map.withdrawal !== undefined && map.deposit !== undefined)
    const hasDesc = map.description !== undefined
    if (hasDate && hasAmount && hasDesc) return { headerIdx: i, map }
  }
  return null
}

function excelDateToISO(v: any): string {
  if (v == null || v === '') return ''
  if (typeof v === 'number') {
    // Excel serial date - days since 1899-12-30
    const ms = Math.round((v - 25569) * 86400 * 1000)
    const d = new Date(ms)
    if (!isNaN(d.getTime())) {
      return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
    }
  }
  const s = String(v).trim()
  // DD/Mon/YYYY or DD-Mon-YYYY
  const iso1 = parseDate(s)
  if (iso1) return iso1
  // DD/MM/YYYY or DD-MM-YYYY
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/)
  if (m) {
    const yyyy = m[3].length === 2 ? `20${m[3]}` : m[3]
    return `${yyyy}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  }
  // YYYY-MM-DD already
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
  return ''
}

function toNumber(v: any): number {
  if (v == null || v === '') return 0
  if (typeof v === 'number') return v
  return parseFloat(String(v).replace(/[^0-9.\-]/g, '')) || 0
}

function detectMode(desc: string): string {
  const u = desc.toUpperCase()
  if (/\bUPI\b/.test(u)) return 'UPI'
  if (/\bRTGS\b/.test(u)) return 'RTGS'
  if (/\b(NEFT|INFT)\b/.test(u)) return 'NEFT'
  if (/\b(IMPS|MMT)\b/.test(u)) return 'IMPS'
  if (/\bCHEQUE\b|\bCHQ\b/.test(u)) return 'CHEQUE'
  if (/\bCASH\b/.test(u)) return 'CASH'
  return 'OTHER'
}

function parseSheet(rows: any[][]): {
  rows: TxnRow[]
  summary: Summary | null
  reconciliation: any
  debug: string
} {
  const hdr = findHeaderRow(rows)
  if (!hdr) {
    return {
      rows: [],
      summary: null,
      reconciliation: {
        parsedWithdrawals: 0, parsedDeposits: 0,
        summaryWithdrawals: null, summaryDeposits: null,
        withdrawalsMatch: false, depositsMatch: false, netMatch: false,
      },
      debug: 'No recognisable header row found. Looked for Date + Description + (Amount or Dr/Cr) columns.',
    }
  }

  const { headerIdx, map } = hdr
  const out: TxnRow[] = []
  let si = 0

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i]
    if (!r || r.every(c => c == null || String(c).trim() === '')) continue

    const txnDate = excelDateToISO(r[map.date!])
    if (!txnDate) continue

    const description = String(r[map.description!] ?? '').trim()
    if (!description) continue

    let withdrawal = 0
    let deposit = 0

    if (map.withdrawal !== undefined && map.deposit !== undefined) {
      // Separate Dr / Cr columns
      withdrawal = toNumber(r[map.withdrawal])
      deposit = toNumber(r[map.deposit])
    } else if (map.amount !== undefined && map.crDr !== undefined) {
      // Single amount column + Cr/Dr indicator
      const amt = Math.abs(toNumber(r[map.amount]))
      const flag = String(r[map.crDr] ?? '').toUpperCase().trim()
      if (flag === 'CR' || flag.startsWith('C')) deposit = amt
      else withdrawal = amt
    } else if (map.amount !== undefined) {
      // Single signed amount column
      const amt = toNumber(r[map.amount])
      if (amt >= 0) deposit = amt
      else withdrawal = -amt
    }

    if (!withdrawal && !deposit) continue

    si++
    const balance = map.balance !== undefined ? toNumber(r[map.balance]) : 0
    const tranId = map.tranId !== undefined ? String(r[map.tranId] ?? '').trim() : ''
    const mode = detectMode(description)
    const { paidTo, accountRef } = extractBeneficiary(description)

    out.push({
      si,
      tranId: tranId || `XLS-${i}`,
      txnDate,
      remarks: description.slice(0, 300),
      paidTo,
      accountRef,
      withdrawal,
      deposit,
      balance,
      mode,
    })
  }

  const parsedWithdrawals = out.reduce((s, r) => s + r.withdrawal, 0)
  const parsedDeposits = out.reduce((s, r) => s + r.deposit, 0)

  return {
    rows: out,
    summary: null,
    reconciliation: {
      parsedWithdrawals: +parsedWithdrawals.toFixed(2),
      parsedDeposits: +parsedDeposits.toFixed(2),
      summaryWithdrawals: null,
      summaryDeposits: null,
      withdrawalsMatch: false,
      depositsMatch: false,
      netMatch: false,
    },
    debug: `Excel/CSV: header at row ${headerIdx + 1}; columns mapped → ${JSON.stringify(map)}; ${out.length} transactions parsed.`,
  }
}

async function parseExcel(bytes: Uint8Array): Promise<any[][]> {
  // @ts-ignore esm.sh dynamic import
  const XLSX: any = await import('https://esm.sh/xlsx@0.18.5')
  const wb = XLSX.read(bytes, { type: 'array', cellDates: false })
  const sheet = wb.Sheets[wb.SheetNames[0]]
  return XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: true }) as any[][]
}

function parseCSV(text: string): any[][] {
  const lines = text.split(/\r?\n/)
  const rows: any[][] = []
  for (const line of lines) {
    if (!line.trim()) continue
    // Simple CSV - split on commas, honour double quotes
    const cells: string[] = []
    let cur = ''
    let inQuotes = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') { cur += '"'; i++ }
        else inQuotes = !inQuotes
      } else if (ch === ',' && !inQuotes) {
        cells.push(cur); cur = ''
      } else {
        cur += ch
      }
    }
    cells.push(cur)
    rows.push(cells.map(c => c.trim()))
  }
  return rows
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsResponse()

  const { user, response: authResponse } = await requireAuth(req)
  if (authResponse) return authResponse

  if (req.method !== 'POST') return error('Method not allowed', 405)

  const contentType = req.headers.get('content-type') || ''
  let bytes: Uint8Array
  let filename = ''

  try {
    if (contentType.includes('multipart/form-data')) {
      const form = await req.formData()
      const file = form.get('file') as File | null
      if (!file) return error('No file uploaded', 400)
      bytes = new Uint8Array(await file.arrayBuffer())
      filename = file.name || ''
    } else {
      bytes = new Uint8Array(await req.arrayBuffer())
    }

    const lowerName = filename.toLowerCase()
    const isExcel = lowerName.endsWith('.xlsx') || lowerName.endsWith('.xls')
    const isCsv = lowerName.endsWith('.csv')

    if (isExcel || isCsv) {
      const sheetRows = isExcel
        ? await parseExcel(bytes)
        : parseCSV(new TextDecoder().decode(bytes))
      const result = parseSheet(sheetRows)
      return json({
        rows: result.rows,
        count: result.rows.length,
        summary: result.summary,
        reconciliation: result.reconciliation,
        debug: result.debug,
        flatSample: '',
      })
    }

    // Default: PDF
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
