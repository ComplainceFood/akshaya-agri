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

  // Collect items per page with x, y (top-origin), page number
  const allItems: { x: number; y: number; pg: number; text: string }[] = []

  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p)
    const viewport = page.getViewport({ scale: 1 })
    const content = await page.getTextContent()
    for (const item of content.items as any[]) {
      const s = item.str
      if (!s?.trim()) continue
      allItems.push({
        x: Math.round(item.transform[4]),
        y: Math.round(viewport.height - item.transform[5]),
        pg: p,
        text: s.trim(),
      })
    }
  }

  return parseICICIStream(allItems)
}

// ── ICICI text-stream parser ───────────────────────────────────────────────
// Strategy: sort by page then y then x, group into visual lines (y within 4px),
// then scan for lines starting with an integer SI number.
// Between consecutive SI-number lines we collect all tokens and extract
// the fields using positional column X ranges detected from the header.
function parseICICIStream(
  allItems: { x: number; y: number; pg: number; text: string }[]
): BankRow[] {
  // Sort: page → y → x
  allItems.sort((a, b) => a.pg - b.pg || a.y - b.y || a.x - b.x)

  // Group into visual lines (items whose y is within 4px of first item in group)
  type LineItem = { x: number; text: string }
  type Line = { pg: number; y: number; items: LineItem[] }
  const lines: Line[] = []

  for (const item of allItems) {
    const last = lines[lines.length - 1]
    if (last && last.pg === item.pg && Math.abs(item.y - last.y) <= 4) {
      last.items.push({ x: item.x, text: item.text })
    } else {
      lines.push({ pg: item.pg, y: item.y, items: [{ x: item.x, text: item.text }] })
    }
  }

  // Detect column X positions from the header line
  // The header contains "Sl" / "Tran" / "Value Date" / "Withdrawal" / "Deposit" / "Balance"
  let colX = {
    siNo: 28, tranId: 58, valueDate: 110, txnDate: 168, postedDate: 228,
    cheque: 290, remarks: 355, withdrawal: 460, deposit: 515, balance: 572,
  }
  for (const line of lines) {
    const joined = line.items.map(i => i.text).join(' ').toLowerCase()
    if (joined.includes('withdrawal') && joined.includes('deposit') && joined.includes('balance') && joined.includes('tran')) {
      const find = (kw: string) => line.items.find(i => i.text.toLowerCase().includes(kw))?.x ?? 0
      colX = {
        siNo:       find('sl') || find('si') || colX.siNo,
        tranId:     find('tran id') || find('tran') || colX.tranId,
        valueDate:  find('value') || colX.valueDate,
        txnDate:    find('transaction d') || colX.txnDate,
        postedDate: find('posted') || colX.postedDate,
        cheque:     find('cheque') || colX.cheque,
        remarks:    find('remarks') || find('transaction r') || colX.remarks,
        withdrawal: find('withdrawal') || find('withdra') || colX.withdrawal,
        deposit:    find('deposit') || colX.deposit,
        balance:    find('balance') || colX.balance,
      }
      break
    }
  }

  // Helper: collect text from a line's items within an X column range
  function colText(items: LineItem[], xMin: number, xMax: number) {
    return items.filter(i => i.x >= xMin && i.x < xMax).map(i => i.text).join(' ').trim()
  }

  // Find indices of "transaction start" lines (SI number at leftmost column)
  // SI number: 1-3 digit integer appearing at x near siNo column
  const txnLineIdxs: number[] = []
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    // Must have an item in the SI No column range
    const siItem = line.items.find(it => it.x >= colX.siNo - 8 && it.x < colX.tranId)
    if (siItem && /^\d{1,4}$/.test(siItem.text)) {
      txnLineIdxs.push(i)
    }
  }

  const rows: BankRow[] = []
  let key = 0

  for (let t = 0; t < txnLineIdxs.length; t++) {
    const startIdx = txnLineIdxs[t]
    const endIdx   = t + 1 < txnLineIdxs.length ? txnLineIdxs[t + 1] : lines.length

    // Collect all items in this transaction's lines (may span 2-4 visual lines)
    const txnLines = lines.slice(startIdx, endIdx)

    // Accumulate text by column across all txn lines
    let remarkParts: string[] = []
    let drTokens: string[] = []
    let crTokens: string[] = []
    let balTokens: string[] = []
    let dates: string[] = []
    let tranIdParts: string[] = []
    let chequeParts: string[] = []

    for (const line of txnLines) {
      const r = colText(line.items, colX.remarks - 8, colX.withdrawal - 4)
      if (r) remarkParts.push(r)

      const dr = colText(line.items, colX.withdrawal - 4, colX.deposit - 4)
      if (dr) drTokens.push(dr)

      const cr = colText(line.items, colX.deposit - 4, colX.balance - 4)
      if (cr) crTokens.push(cr)

      const bal = colText(line.items, colX.balance - 4, 700)
      if (bal) balTokens.push(bal)

      // Dates from valueDate and txnDate columns
      const vd = colText(line.items, colX.valueDate - 4, colX.txnDate - 4)
      if (vd && /\d/.test(vd)) dates.push(vd)
      const td = colText(line.items, colX.txnDate - 4, colX.postedDate - 4)
      if (td && /\d/.test(td)) dates.push(td)

      const tid = colText(line.items, colX.tranId - 4, colX.valueDate - 4)
      if (tid) tranIdParts.push(tid)

      const chq = colText(line.items, colX.cheque - 4, colX.remarks - 4)
      if (chq) chequeParts.push(chq)
    }

    // Reconstruct amounts: tokens like "1,26,335." + "50" → join and parse
    const drStr  = joinAmountTokens(drTokens)
    const crStr  = joinAmountTokens(crTokens)
    const balStr = joinAmountTokens(balTokens)

    const withdrawal = parseAmount(drStr)
    const deposit    = parseAmount(crStr)
    const balance    = parseAmount(balStr)

    if (!withdrawal && !deposit) continue

    const remarks = remarkParts.join(' ').replace(/\s+/g, ' ').trim()

    // Find a valid date
    let txnDate = ''
    for (const d of dates) {
      const parsed = parseDate(d.split(' ')[0])
      if (parsed) { txnDate = parsed; break }
    }

    rows.push({
      _key: key++,
      txnId: tranIdParts.join('').trim(),
      valueDate: txnDate,
      txnDate,
      chequeRef: chequeParts.join(' ').trim(),
      remarks,
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

// Join amount tokens that may be split (e.g., "1,26,335." + "50" → "1,26,335.50")
function joinAmountTokens(tokens: string[]): string {
  if (!tokens.length) return ''
  const joined = tokens.join('')
  // Remove spaces inside the number
  return joined.replace(/\s/g, '')
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
