import * as XLSX from 'xlsx'

// Parses a Sarvani "Consignor Wise Finished Weighing Trs Detailed Report" that
// has been converted from PDF to Excel. The conversion keeps the PDF's stacked
// layout: each truck load spans ~3 rows.
//
//   Row A (anchor): Slip No | In Date  | Out Date | INBOUND  | Consignor | Product | Challan | Gross | Net
//   Row B:          (blank) | In Time  | Out Time | VehicleNo| Consignee | (blank) | Challan | Tare  |
//   Row C:          mostly blank, a stray 0 (Challan Amount / No of Bags)
//
// We anchor on the row whose first column is a 10-digit Slip No, read Gross/Net/
// dates/product from it, then read Vehicle No + Tare from the following row(s)
// until the next anchor. Column positions are detected from the header band so
// the parser survives minor column shifts.
//
// Produces the same row shape the server-side PDF parser returns, so the
// downstream review/save flow in ImportWeighingReport stays unchanged.
export interface WeighingExcelRow {
  challanNo: string
  inDate: string
  outDate: string
  vehicleNumber: string
  product: string
  grossWeight: number
  tareWeight: number
  netWeight: number
}

const PRODUCTS = ['MAIZE', 'HUSK', 'COAL', 'BIOMASS', 'RICE', 'WHEAT', 'PADDY', 'SOYBEAN', 'SUNFLOWER']

// Header aliases (lowercased, alphanumerics only), matched as substrings.
const HEADER_ALIASES = {
  slipNo: ['slipno', 'slip', 'challanno', 'ticketno', 'srno', 'sno'],
  inDate: ['indate', 'intime'],
  outDate: ['outdate', 'outtime'],
  vehicle: ['truckno', 'vehicleno', 'vehicle', 'truck', 'lorryno'],
  product: ['product', 'loadtype', 'commodity', 'material'],
  gross: ['gross'],
  tare: ['tare'],
  net: ['net'],
}

function norm(s: any): string {
  return String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')
}

function toNumber(v: any): number {
  if (typeof v === 'number') return v
  const n = parseFloat(String(v ?? '').replace(/[, ]/g, ''))
  return isNaN(n) ? 0 : n
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// Excel serial date → "DD-MMM-YY". Passes through strings that already look like
// a date (e.g. "24-04-26" or "24-Apr-26") and strips any time-of-day suffix.
function toDateStr(v: any): string {
  if (v == null || v === '') return ''
  if (typeof v === 'number' && v > 0) {
    const d = XLSX.SSF.parse_date_code(v)
    if (d) return `${String(d.d).padStart(2, '0')}-${MONTHS[d.m - 1]}-${String(d.y).slice(-2)}`
  }
  const s = String(v).trim()
  // Drop time-of-day if a date+time slipped into one cell.
  const m = s.match(/\d{1,2}[-/][A-Za-z0-9]{2,3}[-/]\d{2,4}/)
  return m ? m[0] : (/\d{1,2}:\d{2}/.test(s) ? '' : s)
}

function normalizeProduct(v: any): string {
  const s = String(v ?? '').toUpperCase()
  return PRODUCTS.find(p => s.includes(p)) || s.trim()
}

// Vehicle numbers look like AP39E0229 / AP03TL0564 / AP39EW4447, or the literal "FR".
function looksLikeVehicle(v: any): boolean {
  const s = String(v ?? '').trim().toUpperCase()
  return /^[A-Z]{2}\d{2}[A-Z0-9]{1,3}\d{3,4}$/.test(s) || s === 'FR'
}

type ColMap = Partial<Record<keyof typeof HEADER_ALIASES, number>>

// The header is split across two rows (e.g. "Gross" / "Tare" in the same column),
// so scan a band of rows and merge column hits. Returns the detected map plus the
// last header row index so record scanning can start below it.
function detectColumns(rows: any[][]): { cols: ColMap; headerEnd: number } {
  const cols: ColMap = {}
  let headerEnd = -1
  const limit = Math.min(rows.length, 30)
  for (let i = 0; i < limit; i++) {
    const cells = (rows[i] || []).map(norm)
    let hit = false
    cells.forEach((cell, idx) => {
      if (!cell) return
      for (const key of Object.keys(HEADER_ALIASES) as (keyof typeof HEADER_ALIASES)[]) {
        if (cols[key] != null) continue
        if (HEADER_ALIASES[key].some(a => cell.includes(a))) { cols[key] = idx; hit = true }
      }
    })
    if (hit) headerEnd = i
  }
  return { cols, headerEnd }
}

function isSlipNo(v: any): boolean {
  return /^\d{8,12}$/.test(String(v ?? '').trim())
}

export function parseWeighingExcel(bytes: ArrayBuffer): WeighingExcelRow[] {
  const wb = XLSX.read(bytes, { type: 'array', cellDates: false })
  const out: WeighingExcelRow[] = []

  for (const sheetName of wb.SheetNames) {
    const sheet = wb.Sheets[sheetName]
    const rows = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1, defval: '', raw: true })
    if (!rows.length) continue

    const { cols, headerEnd } = detectColumns(rows)
    // Need at least the anchor (slip) and one weight column to proceed.
    const slipCol = cols.slipNo ?? 0
    if (cols.gross == null && cols.net == null) continue

    const cell = (row: any[] | undefined, key: keyof typeof HEADER_ALIASES) =>
      row && cols[key] != null ? row[cols[key]!] : ''

    // Indices of anchor rows (rows whose slip column holds a slip number).
    const anchors: number[] = []
    for (let i = headerEnd + 1; i < rows.length; i++) {
      if (isSlipNo((rows[i] || [])[slipCol])) anchors.push(i)
    }

    for (let a = 0; a < anchors.length; a++) {
      const start = anchors[a]
      const end = a + 1 < anchors.length ? anchors[a + 1] : rows.length
      const anchorRow = rows[start]
      // Follow-up rows belonging to this record (until the next anchor).
      const followRows = rows.slice(start + 1, end)

      const challanNo = String((anchorRow || [])[slipCol] ?? '').trim()

      let grossWeight = toNumber(cell(anchorRow, 'gross'))
      let netWeight = toNumber(cell(anchorRow, 'net'))

      // Tare lives in the gross column on a follow-up row (Gross/Tare stacked).
      let tareWeight = 0
      for (const fr of followRows) {
        const t = toNumber(cols.tare != null ? fr[cols.tare] : cell(fr, 'gross'))
        if (t > 0) { tareWeight = t; break }
      }

      // Vehicle number: usually the vehicle column on a follow-up row; fall back
      // to scanning all cells of the record's rows for a plate-shaped value.
      let vehicleNumber = ''
      for (const fr of [anchorRow, ...followRows]) {
        const direct = cols.vehicle != null ? fr[cols.vehicle] : ''
        if (looksLikeVehicle(direct)) { vehicleNumber = String(direct).trim().toUpperCase(); break }
      }
      if (!vehicleNumber) {
        for (const fr of [anchorRow, ...followRows]) {
          const hit = (fr || []).find(looksLikeVehicle)
          if (hit) { vehicleNumber = String(hit).trim().toUpperCase(); break }
        }
      }

      // Dates: from the anchor row, falling back to follow rows.
      let inDate = toDateStr(cell(anchorRow, 'inDate'))
      let outDate = toDateStr(cell(anchorRow, 'outDate'))
      for (const fr of followRows) {
        if (!inDate) inDate = toDateStr(cell(fr, 'inDate'))
        if (!outDate) outDate = toDateStr(cell(fr, 'outDate'))
      }
      if (!outDate) outDate = inDate
      if (!inDate) inDate = outDate

      // Product: anchor row, else any follow row.
      let product = normalizeProduct(cell(anchorRow, 'product'))
      if (!product) {
        for (const fr of followRows) {
          const p = normalizeProduct(cell(fr, 'product'))
          if (p) { product = p; break }
        }
      }

      // Derive any missing weight when two of three are known.
      if (!netWeight && grossWeight && tareWeight) netWeight = grossWeight - tareWeight
      if (!tareWeight && grossWeight && netWeight) tareWeight = grossWeight - netWeight
      if (!grossWeight && netWeight && tareWeight) grossWeight = netWeight + tareWeight

      if (!netWeight && !grossWeight) continue

      out.push({
        challanNo,
        inDate,
        outDate,
        vehicleNumber,
        product,
        grossWeight,
        tareWeight,
        netWeight,
      })
    }
  }

  return out
}
