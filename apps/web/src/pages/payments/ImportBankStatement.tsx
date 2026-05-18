import { useState } from 'react'
import {
  Modal, Button, Table, Select, Tag, Alert, Space, Typography, Upload,
  message as antMessage, Tabs, Divider, Row, Col, Statistic,
} from 'antd'
import { BankOutlined, ArrowDownOutlined, ArrowUpOutlined } from '@ant-design/icons'
import {
  useSuppliers, useCustomers,
  useCreateSupplierPayment, useCreateCustomerReceipt,
} from '../../api/hooks'
import { formatINR } from '../../utils/format'
import dayjs from 'dayjs'
import customParseFormat from 'dayjs/plugin/customParseFormat'
dayjs.extend(customParseFormat)

const { Text } = Typography

// ── Types ─────────────────────────────────────────────────────────────────────
interface BankRow {
  _key: number
  txnId: string
  valueDate: string       // YYYY-MM-DD
  txnDate: string         // YYYY-MM-DD
  chequeRef: string
  remarks: string
  withdrawal: number      // Dr amount
  deposit: number         // Cr amount
  balance: number
  parsedName: string      // extracted from remarks
  mode: string            // UPI / NEFT / RTGS / IMPS / INF / INFT
  // user mapping
  supplierId: string | null
  customerId: string | null
  skip: boolean
}

// ── PDF parser ────────────────────────────────────────────────────────────────
async function parsePDF(file: File): Promise<BankRow[]> {
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.js')
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/legacy/build/pdf.worker.js',
    import.meta.url,
  ).toString()

  const arrayBuffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise

  // Concatenate ALL text items in reading order into one big string
  // Skip empty strings but join non-empty ones with a single space
  const allText: string[] = []
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p)
    const content = await page.getTextContent()
    for (const item of content.items as any[]) {
      const s = item.str
      if (!s) continue
      const trimmed = s.trim()
      if (trimmed) allText.push(trimmed)
    }
  }

  return parseICICIFlatText(allText)
}

// ── ICICI flat-text parser ────────────────────────────────────────────────
// Strategy: PDF fragments come in reading order. Each transaction starts with
// "<SI_NO> S<digits>" pattern. We scan tokens, and when we find a SI number
// followed by a Tran Id, we collect everything until the next SI/Tran Id pair
// and extract amounts/dates/remarks via regex on the joined string.
function parseICICIFlatText(tokens: string[]): BankRow[] {
  // Join all tokens with single space — this normalizes split fragments
  const fullText = tokens.join(' ')

  // Find all transaction starts: <SI_number> S<digits> (e.g., "1 S4987 083" or "12 S2203 0652")
  // SI number is 1-3 digits. Tran Id starts with S and contains digits, possibly split by spaces.
  // We use a regex with multiple captures and process the matches in order.

  // Match: SI_NO + space + S<digits> [optional space + more digits]
  // Followed by: date / amounts / remarks until next SI_NO + S<digits>
  // Easiest: find all positions of "<N> S<digits>" boundaries, then slice between them.

  // Find ALL match positions for "<num> S<digits>" where num is the running SI.
  // We expect SI numbers to be sequential starting from 1.

  const rows: BankRow[] = []

  // Use a regex that finds: word-boundary, SI number, space, S followed by 4+ digits
  const boundaryRe = /(?<=\s|^)(\d{1,3})\s+(S\d{3,}(?:\s+\d+)?)\s+(\d{1,2}\/\w{3}\/\d{2,4}(?:\s*\d{0,2})?)/g

  // Collect all match start positions and expected SI numbers
  const matches: { si: number; tranId: string; dateStr: string; startIdx: number; matchEnd: number }[] = []
  let m: RegExpExecArray | null
  let lastSi = 0
  while ((m = boundaryRe.exec(fullText)) !== null) {
    const si = parseInt(m[1], 10)
    // Only accept SI numbers that follow sequence (allow same or +1, skip header noise)
    if (si === lastSi + 1 || (lastSi === 0 && si === 1)) {
      matches.push({
        si,
        tranId: m[2].replace(/\s+/g, ''),
        dateStr: m[3].replace(/\s+/g, ''),
        startIdx: m.index,
        matchEnd: m.index + m[0].length,
      })
      lastSi = si
    }
  }

  // Now slice between matches and extract amounts + remarks from each block
  for (let i = 0; i < matches.length; i++) {
    const cur = matches[i]
    const next = matches[i + 1]
    const block = fullText.substring(cur.matchEnd, next ? next.startIdx : fullText.length)

    // Parse date from cur.dateStr (e.g., "01/Apr/2026" or "01/Apr/20" + "26" joined)
    const txnDate = parseDate(cur.dateStr) ||
                    parseDate(cur.dateStr.replace(/(\d{2})\/(\w{3})\/(\d{2})(\d{2})/, '$1/$2/$3$4'))

    // Find all amount patterns in the block.
    // ICICI amounts: digits with commas + dot + 2 digits, e.g., "1,00,000.00" or "11.80"
    // After PDF fragment join, an amount may have a space: "1,00,000. 00" or "1,26,335. 50"
    // Regex: digits/commas, optional space, dot, optional space, 2 digits
    const amountRe = /(?:\d{1,3}(?:,\d{2,3})*|\d+)\s*\.\s*\d{2}/g
    const amounts: number[] = []
    let am: RegExpExecArray | null
    while ((am = amountRe.exec(block)) !== null) {
      const cleaned = am[0].replace(/\s+/g, '')
      const n = parseAmount(cleaned)
      if (n > 0) amounts.push(n)
    }

    if (amounts.length < 1) continue

    // The last amount in the block is the balance.
    // If there are 2 amounts: one is the Dr OR Cr, the other is balance.
    // If there are 3 amounts: shouldn't happen, but defensive.
    // We need to determine whether the non-balance amount is Dr or Cr.
    // ICICI PDF prints either Dr or Cr column for each row — the other is blank.
    // So # amounts is usually 2: [txn_amount, balance].
    // We use REMARKS heuristic: NEFT inbound credits from Sarvani Bio Fuels are Cr.
    // But the most reliable is: the printed column. Since we lost column info in flat
    // text, we use this rule: if remarks include "NEFT-CNRB" (Sarvani inward), it's a credit.

    let txnAmount = 0
    let balance = 0
    if (amounts.length >= 2) {
      txnAmount = amounts[0]
      balance = amounts[amounts.length - 1]
    } else {
      txnAmount = amounts[0]
    }

    // Remarks: everything in the block that isn't a date or amount.
    // Strip dates and amounts from the block to get the remarks.
    let remarks = block
      .replace(/\d{1,2}\/\w{3}\/\d{2,4}/g, ' ')          // value/txn dates
      .replace(/\d{1,2}-\w{3}-\d{4}/g, ' ')              // posted dates
      .replace(/\d{1,2}:\d{2}:\d{2}\s*[AP]M/gi, ' ')     // times
      .replace(/(?:\d{1,3}(?:,\d{2,3})*|\d+)\s*\.\s*\d{2}/g, ' ')  // amounts
      .replace(/\s+/g, ' ')
      .trim()

    // Determine Dr/Cr: NEFT-CNRBH inward credits, NEFT-RETURN, RTGS RETURN are credits
    const remarksUpper = remarks.toUpperCase()
    const isCredit =
      /NEFT-?\s*CNRBH/.test(remarksUpper) ||           // Sarvani Bio Fuels NEFT in
      /RTGS-?\s*CNRBR/.test(remarksUpper) ||           // Sarvani RTGS in
      /NEFT-?\s*RETURN/.test(remarksUpper) ||          // returned NEFT credits back
      /RTGS\s*RETURN/.test(remarksUpper) ||
      /SARVANI BIO FUELS/.test(remarksUpper)

    const withdrawal = isCredit ? 0 : txnAmount
    const deposit    = isCredit ? txnAmount : 0

    rows.push({
      _key: cur.si,
      txnId: cur.tranId,
      valueDate: txnDate,
      txnDate,
      chequeRef: '',
      remarks: remarks.substring(0, 300),
      withdrawal,
      deposit,
      balance,
      parsedName: extractName(remarks),
      mode: extractMode(remarks),
      supplierId: null,
      customerId: null,
      skip: false,
    })
  }

  return rows
}

function parseAmount(s: string): number {
  if (!s) return 0
  return Number(s.replace(/[^0-9.]/g, '')) || 0
}

function parseDate(s: string): string {
  const d = dayjs(s, ['DD/MMM/YYYY', 'DD/Apr/YYYY', 'DD/May/YYYY', 'DD-MMM-YYYY', 'DD/MM/YYYY'], true)
  if (d.isValid()) return d.format('YYYY-MM-DD')
  // Try month-name variants the ICICI PDF uses: "01/Apr/2026"
  const m = s.match(/(\d{2})\/(\w{3})\/(\d{4})/)
  if (m) {
    const parsed = dayjs(`${m[1]} ${m[2]} ${m[3]}`, 'DD MMM YYYY')
    if (parsed.isValid()) return parsed.format('YYYY-MM-DD')
  }
  return ''
}

function extractMode(remarks: string): string {
  const r = remarks.toUpperCase()
  if (r.startsWith('UPI')) return 'UPI'
  if (r.startsWith('NEFT') || r.includes('NEFT')) return 'NEFT'
  if (r.startsWith('RTGS') || r.includes('RTGS')) return 'RTGS'
  if (r.startsWith('MMT') || r.startsWith('IMPS')) return 'IMPS'
  if (r.startsWith('INF/NEFT')) return 'NEFT'
  if (r.startsWith('INF/INFT') || r.startsWith('INFT')) return 'NEFT'
  return 'OTHER'
}

function extractName(remarks: string): string {
  // Patterns in ICICI statements:
  // "UPI/.../.../SobhanBabu/SBIN..."  → last segment before bank code
  // "NEFT...SARVANI BIO FUELS PRIVATE LIMITED-BILL NO..."
  // "MMT/IMPS/.../BeneName/BANKCODE"
  // "INF/NEFT/.../BeneName /"

  // Try NEFT name pattern
  const neftMatch = remarks.match(/SARVANI BIO FUELS[^-]*/i)
  if (neftMatch) return neftMatch[0].trim()

  // Slash-delimited: take 3rd-to-last or 4th segment
  const parts = remarks.split('/')
  if (parts.length >= 3) {
    // Find first part that looks like a name (alpha chars, not hex/numbers, not bank IFSC)
    for (let i = parts.length - 1; i >= 2; i--) {
      const p = parts[i].trim()
      // Skip bank codes like SBIN0006979, HDFC0001034, hex strings, etc.
      if (/^[A-Z]{4}[0-9]/.test(p)) continue
      if (/^[0-9a-f]{8,}$/i.test(p)) continue
      if (p.length > 3 && /[a-zA-Z]/.test(p)) return p.split('@')[0].replace(/-\d+$/, '').trim()
    }
  }

  // Fallback: first 40 chars
  return remarks.substring(0, 40)
}


// ── Excel parser (existing bulk payment format) ───────────────────────────────
function parseExcelRows(file: File): Promise<BankRow[]> {
  return new Promise((resolve, reject) => {
    import('xlsx').then(XLSX => {
      const reader = new FileReader()
      reader.onload = (e) => {
        try {
          const wb = XLSX.read(e.target?.result, { type: 'array' })
          const sheet = wb.Sheets[wb.SheetNames[0]]
          const raw: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' })

          // Find header row
          let headerIdx = -1
          for (let i = 0; i < Math.min(raw.length, 15); i++) {
            const row = raw[i].map((c: any) => String(c ?? '').toLowerCase())
            if (row.some(c => c.includes('withdrawal') || c.includes('deposit') || c.includes('amount'))) {
              headerIdx = i; break
            }
          }
          if (headerIdx === -1) { resolve([]); return }

          const headers = raw[headerIdx].map((c: any) => String(c ?? '').toLowerCase().replace(/[^a-z0-9]/g, ''))
          const col = (aliases: string[]) => headers.findIndex(h => aliases.some(a => h.includes(a)))

          const dateCol     = col(['transactiondate', 'valuedate', 'txndate', 'date'])
          const remarksCol  = col(['transactionremarks', 'remarks', 'narration', 'remark'])
          const drCol       = col(['withdrawal', 'dr', 'debit'])
          const crCol       = col(['deposit', 'cr', 'credit'])
          const balCol      = col(['balance'])
          const refCol      = col(['chequeno', 'refno', 'ref', 'utr'])
          const tranIdCol   = col(['tranid', 'txnid'])

          const rows: BankRow[] = []
          for (let i = headerIdx + 1; i < raw.length; i++) {
            const r = raw[i]
            if (!r || r.every((c: any) => !c)) continue
            const dr = drCol >= 0 ? parseAmount(String(r[drCol] ?? '')) : 0
            const cr = crCol >= 0 ? parseAmount(String(r[crCol] ?? '')) : 0
            if (!dr && !cr) continue

            const rawDate = dateCol >= 0 ? String(r[dateCol] ?? '') : ''
            let txnDate = parseDate(rawDate)
            if (!txnDate && typeof r[dateCol] === 'number') {
              txnDate = dayjs(new Date((r[dateCol] - 25569) * 86400000)).format('YYYY-MM-DD')
            }

            const remarks = remarksCol >= 0 ? String(r[remarksCol] ?? '') : ''
            rows.push({
              _key: i,
              txnId: tranIdCol >= 0 ? String(r[tranIdCol] ?? '') : String(i),
              valueDate: txnDate,
              txnDate,
              chequeRef: refCol >= 0 ? String(r[refCol] ?? '') : '',
              remarks,
              withdrawal: dr,
              deposit: cr,
              balance: balCol >= 0 ? parseAmount(String(r[balCol] ?? '')) : 0,
              parsedName: extractName(remarks),
              mode: extractMode(remarks),
              supplierId: null,
              customerId: null,
              skip: false,
            })
          }
          resolve(rows)
        } catch (err) {
          reject(err)
        }
      }
      reader.readAsArrayBuffer(file)
    })
  })
}

// ── Mode color ────────────────────────────────────────────────────────────────
const modeColor: Record<string, string> = {
  UPI: 'cyan', NEFT: 'blue', RTGS: 'purple', IMPS: 'geekblue', OTHER: 'default',
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function ImportBankStatement({ onDone }: { onDone: () => void }) {
  const [open, setOpen] = useState(false)
  const [rows, setRows] = useState<BankRow[]>([])
  const [saving, setSaving] = useState(false)
  const [parsing, setParsing] = useState(false)

  const { data: suppliers = [] } = useSuppliers()
  const { data: customers = [] } = useCustomers()
  const { mutateAsync: createPayment } = useCreateSupplierPayment()
  const { mutateAsync: createReceipt } = useCreateCustomerReceipt()

  async function handleFile(file: File) {
    setParsing(true)
    try {
      let parsed: BankRow[] = []
      if (file.name.toLowerCase().endsWith('.pdf')) {
        parsed = await parsePDF(file)
      } else {
        parsed = await parseExcelRows(file)
      }

      if (!parsed.length) {
        antMessage.error('No transactions found. Check the file format.')
        setParsing(false)
        return
      }

      // Auto-match suppliers by bank account or name
      const supplierByAcct: Record<string, string> = {}
      const supplierByName: Record<string, string> = {}
      for (const s of suppliers as any[]) {
        if (s.bankAccount) supplierByAcct[s.bankAccount.replace(/\s/g, '').toLowerCase()] = s.id
        supplierByName[s.name.toLowerCase()] = s.id
      }
      const customerByName: Record<string, string> = {}
      for (const c of customers as any[]) {
        customerByName[c.name.toLowerCase()] = c.id
      }

      const mapped = parsed.map(r => {
        const nameLower = r.parsedName.toLowerCase()
        let supplierId: string | null = null
        let customerId: string | null = null

        if (r.withdrawal > 0) {
          // Debit = supplier payment — try name match
          for (const [name, id] of Object.entries(supplierByName)) {
            if (nameLower.includes(name) || name.includes(nameLower)) { supplierId = id; break }
          }
        } else if (r.deposit > 0) {
          // Credit = customer receipt — try name match
          for (const [name, id] of Object.entries(customerByName)) {
            if (nameLower.includes(name) || name.includes(nameLower)) { customerId = id; break }
          }
        }

        return { ...r, supplierId, customerId }
      })

      setRows(mapped)
      setOpen(true)
    } catch (err) {
      console.error(err)
      antMessage.error('Failed to parse file.')
    } finally {
      setParsing(false)
    }
    return false
  }

  function setField(key: number, field: 'supplierId' | 'customerId' | 'skip', value: any) {
    setRows(prev => prev.map(r => r._key === key ? { ...r, [field]: value } : r))
  }

  async function handleSave() {
    const debits  = rows.filter(r => !r.skip && r.withdrawal > 0 && r.supplierId)
    const credits = rows.filter(r => !r.skip && r.deposit > 0 && r.customerId)
    if (!debits.length && !credits.length) {
      antMessage.warning('Assign at least one supplier or customer before saving')
      return
    }
    setSaving(true)
    let saved = 0, failed = 0
    for (const r of debits) {
      try {
        await createPayment({
          supplierId: r.supplierId,
          amount: r.withdrawal,
          paymentMode: (['NEFT','RTGS','IMPS','UPI','CHEQUE','CASH'].includes(r.mode) ? r.mode : 'NEFT'),
          paymentDate: r.txnDate || dayjs().format('YYYY-MM-DD'),
          referenceNumber: r.chequeRef || r.txnId || '',
          notes: r.remarks.substring(0, 200),
        })
        saved++
      } catch { failed++ }
    }
    for (const r of credits) {
      try {
        await createReceipt({
          customerId: r.customerId,
          amount: r.deposit,
          paymentMode: (['NEFT','RTGS','IMPS','UPI','CHEQUE','CASH'].includes(r.mode) ? r.mode : 'NEFT'),
          receiptDate: r.txnDate || dayjs().format('YYYY-MM-DD'),
          referenceNumber: r.chequeRef || r.txnId || '',
          notes: r.remarks.substring(0, 200),
        })
        saved++
      } catch { failed++ }
    }
    setSaving(false)
    if (saved) antMessage.success(`${saved} transaction${saved > 1 ? 's' : ''} recorded`)
    if (failed) antMessage.error(`${failed} failed to save`)
    setOpen(false)
    setRows([])
    onDone()
  }

  const debits  = rows.filter(r => r.withdrawal > 0)
  const credits = rows.filter(r => r.deposit > 0)
  const assignedDebits   = debits.filter(r => r.supplierId && !r.skip).length
  const assignedCredits  = credits.filter(r => r.customerId && !r.skip).length

  // ── Columns for debit (supplier payment) rows ──
  const debitCols = [
    {
      title: 'Date', dataIndex: 'txnDate', key: 'date', width: 90,
      render: (v: string) => v ? dayjs(v).format('DD/MM/YY') : <span style={{ color: '#f5222d' }}>?</span>,
    },
    { title: 'Mode', dataIndex: 'mode', key: 'mode', width: 65, render: (v: string) => <Tag color={modeColor[v] ?? 'default'} style={{ fontSize: 10 }}>{v}</Tag> },
    {
      title: 'Parsed Name / Remarks', key: 'name', ellipsis: true,
      render: (_: any, r: BankRow) => (
        <div>
          <div style={{ fontWeight: 600, fontSize: 12 }}>{r.parsedName}</div>
          <div style={{ color: '#888', fontSize: 10, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 260 }}>{r.remarks}</div>
        </div>
      ),
    },
    {
      title: 'Amount (Dr)', dataIndex: 'withdrawal', key: 'amt', width: 120, align: 'right' as const,
      render: (v: number) => <b style={{ color: '#cf1322' }}>{formatINR(v)}</b>,
    },
    {
      title: <span style={{ color: '#cf1322' }}>* Map to Supplier</span>,
      key: 'supplier', width: 210,
      render: (_: any, r: BankRow) => (
        <Select
          placeholder="Select supplier…"
          style={{ width: '100%' }}
          value={r.supplierId ?? undefined}
          allowClear showSearch optionFilterProp="label"
          options={[
            { value: '__skip__', label: '— Skip this row —' },
            ...(suppliers as any[]).map((s: any) => ({ value: s.id, label: s.name })),
          ]}
          onChange={v => {
            if (v === '__skip__') { setField(r._key, 'skip', true); setField(r._key, 'supplierId', null) }
            else { setField(r._key, 'supplierId', v ?? null); setField(r._key, 'skip', false) }
          }}
          size="small"
          status={!r.supplierId && !r.skip ? 'warning' : undefined}
        />
      ),
    },
  ]

  // ── Columns for credit (customer receipt) rows ──
  const creditCols = [
    {
      title: 'Date', dataIndex: 'txnDate', key: 'date', width: 90,
      render: (v: string) => v ? dayjs(v).format('DD/MM/YY') : <span style={{ color: '#f5222d' }}>?</span>,
    },
    { title: 'Mode', dataIndex: 'mode', key: 'mode', width: 65, render: (v: string) => <Tag color={modeColor[v] ?? 'default'} style={{ fontSize: 10 }}>{v}</Tag> },
    {
      title: 'Parsed Name / Remarks', key: 'name', ellipsis: true,
      render: (_: any, r: BankRow) => (
        <div>
          <div style={{ fontWeight: 600, fontSize: 12 }}>{r.parsedName}</div>
          <div style={{ color: '#888', fontSize: 10, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 260 }}>{r.remarks}</div>
        </div>
      ),
    },
    {
      title: 'Amount (Cr)', dataIndex: 'deposit', key: 'amt', width: 120, align: 'right' as const,
      render: (v: number) => <b style={{ color: '#2e7d32' }}>{formatINR(v)}</b>,
    },
    {
      title: <span style={{ color: '#2e7d32' }}>* Map to Customer</span>,
      key: 'customer', width: 210,
      render: (_: any, r: BankRow) => (
        <Select
          placeholder="Select customer…"
          style={{ width: '100%' }}
          value={r.customerId ?? undefined}
          allowClear showSearch optionFilterProp="label"
          options={[
            { value: '__skip__', label: '— Skip this row —' },
            ...(customers as any[]).map((c: any) => ({ value: c.id, label: c.name })),
          ]}
          onChange={v => {
            if (v === '__skip__') { setField(r._key, 'skip', true); setField(r._key, 'customerId', null) }
            else { setField(r._key, 'customerId', v ?? null); setField(r._key, 'skip', false) }
          }}
          size="small"
          status={!r.customerId && !r.skip ? 'warning' : undefined}
        />
      ),
    },
  ]

  const totalDebit  = debits.reduce((s, r) => s + r.withdrawal, 0)
  const totalCredit = credits.reduce((s, r) => s + r.deposit, 0)

  return (
    <>
      <Upload
        accept=".pdf,.xlsx,.xls,.csv"
        showUploadList={false}
        beforeUpload={(file) => { handleFile(file); return false }}
      >
        <Button icon={<BankOutlined />} loading={parsing}>
          Import Bank Statement
        </Button>
      </Upload>

      <Modal
        title={<Space><BankOutlined /> Import ICICI Bank Statement</Space>}
        open={open}
        onCancel={() => { setOpen(false); setRows([]) }}
        width={1050}
        styles={{ body: { padding: '12px 16px' } }}
        footer={
          <Space style={{ justifyContent: 'space-between', width: '100%' }}>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {assignedDebits} supplier payment{assignedDebits !== 1 ? 's' : ''} &nbsp;·&nbsp;
              {assignedCredits} customer receipt{assignedCredits !== 1 ? 's' : ''} ready to save
            </Text>
            <Space>
              <Button onClick={() => { setOpen(false); setRows([]) }}>Cancel</Button>
              <Button
                type="primary"
                loading={saving}
                disabled={assignedDebits + assignedCredits === 0}
                onClick={handleSave}
              >
                Save {assignedDebits + assignedCredits} Transaction{assignedDebits + assignedCredits !== 1 ? 's' : ''}
              </Button>
            </Space>
          </Space>
        }
      >
        {/* Summary */}
        <Row gutter={12} style={{ marginBottom: 12 }}>
          <Col span={6}>
            <div style={{ background: '#fff7f7', border: '1px solid #ffccc7', borderRadius: 8, padding: '8px 14px' }}>
              <div style={{ fontSize: 11, color: '#888' }}>Withdrawals (Dr)</div>
              <div style={{ fontWeight: 700, color: '#cf1322', fontSize: 15 }}>{formatINR(totalDebit)}</div>
              <div style={{ fontSize: 11, color: '#888' }}>{debits.length} rows → Supplier Payments</div>
            </div>
          </Col>
          <Col span={6}>
            <div style={{ background: '#f6fbf6', border: '1px solid #c8e6c9', borderRadius: 8, padding: '8px 14px' }}>
              <div style={{ fontSize: 11, color: '#888' }}>Deposits (Cr)</div>
              <div style={{ fontWeight: 700, color: '#2e7d32', fontSize: 15 }}>{formatINR(totalCredit)}</div>
              <div style={{ fontSize: 11, color: '#888' }}>{credits.length} rows → Customer Receipts</div>
            </div>
          </Col>
          <Col span={12}>
            <Alert
              type="info" showIcon
              message="Map each row to a supplier (for debits) or customer (for credits). Choose '— Skip this row —' for bank charges, cess payments, or internal transfers."
              style={{ fontSize: 11 }}
            />
          </Col>
        </Row>

        <Tabs
          size="small"
          items={[
            {
              key: 'debits',
              label: <span><ArrowDownOutlined style={{ color: '#cf1322' }} /> Supplier Payments ({debits.length}) — {assignedDebits} mapped</span>,
              children: (
                <Table
                  dataSource={debits}
                  columns={debitCols}
                  rowKey="_key"
                  size="small"
                  pagination={false}
                  scroll={{ x: 800, y: 380 }}
                  rowClassName={(r) => r.skip ? 'import-row-skipped' : (!r.supplierId ? 'import-row-unassigned' : '')}
                />
              ),
            },
            {
              key: 'credits',
              label: <span><ArrowUpOutlined style={{ color: '#2e7d32' }} /> Customer Receipts ({credits.length}) — {assignedCredits} mapped</span>,
              children: (
                <Table
                  dataSource={credits}
                  columns={creditCols}
                  rowKey="_key"
                  size="small"
                  pagination={false}
                  scroll={{ x: 800, y: 380 }}
                  rowClassName={(r) => r.skip ? 'import-row-skipped' : (!r.customerId ? 'import-row-unassigned' : '')}
                />
              ),
            },
          ]}
        />
      </Modal>
    </>
  )
}
