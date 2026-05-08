import { useState, useRef } from 'react'
import {
  Modal, Button, Table, Select, Tag, Alert, Space, Typography, Upload,
  message as antMessage, Tooltip, Divider,
} from 'antd'
import { UploadOutlined, CheckCircleOutlined, CloseCircleOutlined, BankOutlined } from '@ant-design/icons'
import * as XLSX from 'xlsx'
import { useSuppliers, useCreateSupplierPayment } from '../../api/hooks'
import { formatINR } from '../../utils/format'
import dayjs from 'dayjs'

const { Text } = Typography

// ICICI bulk payment report column headers (case-insensitive match)
const COL_MAP: Record<string, string[]> = {
  mode:       ['pymt_mode', 'payment mode', 'mode'],
  seqNum:     ['file_seq_uence_num', 'file_sequence_num', 'file_seq_num', 'seq'],
  debitAcct:  ['debit_acct_no', 'debit_a cct_no', 'debit acct no'],
  beneName:   ['beneficiary name', 'bene_name', 'beneficiaryname'],
  beneAcct:   ['beneficiary account no', 'beneficiaryaccountno', 'bene_account_no'],
  beneIfsc:   ['bene_ifsc_code', 'beneifsccode', 'ifsc'],
  amount:     ['amount'],
  remark:     ['remark', 'remarks', 'narration'],
  paymentDate:['pymt_date', 'payment date', 'pymt_d ate', 'date'],
  status:     ['status'],
  custRef:    ['customer ref no', 'customer_ref_no', 'custrefno'],
  utr:        ['utr no', 'utr_no', 'utrno'],
}

function findCol(headers: string[], aliases: string[]): number {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')
  return headers.findIndex(h => aliases.some(a => norm(h).includes(norm(a))))
}

function parseSheet(sheet: XLSX.WorkSheet): any[] {
  // Convert sheet to array-of-arrays to find the header row
  const raw: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' })

  // Find header row (contains "Amount" or "Beneficiary")
  let headerIdx = -1
  for (let i = 0; i < Math.min(raw.length, 10); i++) {
    const row = raw[i].map((c: any) => String(c ?? '').toLowerCase())
    if (row.some(c => c.includes('amount') || c.includes('beneficiary'))) {
      headerIdx = i
      break
    }
  }
  if (headerIdx === -1) return []

  const headers = raw[headerIdx].map((c: any) => String(c ?? ''))
  const colIdx: Record<string, number> = {}
  for (const [key, aliases] of Object.entries(COL_MAP)) {
    colIdx[key] = findCol(headers, aliases)
  }

  const rows: any[] = []
  for (let i = headerIdx + 1; i < raw.length; i++) {
    const r = raw[i]
    if (!r || r.every((c: any) => c === '' || c == null)) continue

    const amount = colIdx.amount >= 0 ? Number(String(r[colIdx.amount]).replace(/[^0-9.]/g, '')) : 0
    if (!amount) continue

    // Parse date — may be serial number (Excel date) or string
    let paymentDate = ''
    if (colIdx.paymentDate >= 0) {
      const raw = r[colIdx.paymentDate]
      if (typeof raw === 'number') {
        paymentDate = dayjs(XLSX.SSF.parse_date_code(raw) ? new Date((raw - 25569) * 86400000) : new Date()).format('YYYY-MM-DD')
      } else {
        const d = dayjs(String(raw), ['DD-MM-YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD', 'DD/MM/YYYY'])
        paymentDate = d.isValid() ? d.format('YYYY-MM-DD') : ''
      }
    }

    rows.push({
      _key: i,
      mode: colIdx.mode >= 0 ? String(r[colIdx.mode] ?? '') : '',
      beneName: colIdx.beneName >= 0 ? String(r[colIdx.beneName] ?? '') : '',
      beneAcct: colIdx.beneAcct >= 0 ? String(r[colIdx.beneAcct] ?? '') : '',
      beneIfsc: colIdx.beneIfsc >= 0 ? String(r[colIdx.beneIfsc] ?? '') : '',
      amount,
      remark: colIdx.remark >= 0 ? String(r[colIdx.remark] ?? '') : '',
      paymentDate,
      status: colIdx.status >= 0 ? String(r[colIdx.status] ?? '') : '',
      utr: colIdx.utr >= 0 ? String(r[colIdx.utr] ?? '') : '',
      custRef: colIdx.custRef >= 0 ? String(r[colIdx.custRef] ?? '') : '',
      supplierId: null as string | null,
    })
  }
  return rows
}

const modeColor: Record<string, string> = { FT: 'geekblue', NEFT: 'blue', RTGS: 'purple', IMPS: 'cyan' }

export default function ImportBankStatement({ onDone }: { onDone: () => void }) {
  const [open, setOpen] = useState(false)
  const [rows, setRows] = useState<any[]>([])
  const [saving, setSaving] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const { data: suppliers = [] } = useSuppliers()
  const { mutateAsync: createPayment } = useCreateSupplierPayment()

  function handleFile(file: File) {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target?.result, { type: 'array' })
        const sheet = wb.Sheets[wb.SheetNames[0]]
        const parsed = parseSheet(sheet)
        if (!parsed.length) {
          antMessage.error('No payment rows found. Make sure this is an ICICI bulk payment report.')
          return
        }
        // Auto-match by bank account number if stored on supplier
        const byAcct: Record<string, string> = {}
        for (const s of suppliers as any[]) {
          if (s.bankAccount) byAcct[s.bankAccount.replace(/\s/g, '')] = s.id
        }
        const mapped = parsed.map(r => ({
          ...r,
          supplierId: byAcct[r.beneAcct.replace(/\s/g, '')] ?? null,
        }))
        setRows(mapped)
        setOpen(true)
      } catch {
        antMessage.error('Failed to parse file. Please upload a valid ICICI bank statement Excel.')
      }
    }
    reader.readAsArrayBuffer(file)
    return false
  }

  function setSupplier(key: number, supplierId: string | null) {
    setRows(prev => prev.map(r => r._key === key ? { ...r, supplierId } : r))
  }

  async function handleSave() {
    const toSave = rows.filter(r => r.supplierId)
    if (!toSave.length) { antMessage.warning('Assign at least one supplier before saving'); return }
    setSaving(true)
    let saved = 0
    let failed = 0
    for (const r of toSave) {
      try {
        await createPayment({
          supplierId: r.supplierId,
          amount: r.amount,
          paymentMode: (['NEFT', 'RTGS', 'IMPS', 'CHEQUE', 'CASH'].includes(r.mode.toUpperCase()) ? r.mode.toUpperCase() : 'NEFT'),
          paymentDate: r.paymentDate || dayjs().format('YYYY-MM-DD'),
          referenceNumber: r.utr || r.custRef || '',
          notes: r.remark || '',
        })
        saved++
      } catch {
        failed++
      }
    }
    setSaving(false)
    if (saved) antMessage.success(`${saved} payment${saved > 1 ? 's' : ''} recorded`)
    if (failed) antMessage.error(`${failed} payment${failed > 1 ? 's' : ''} failed to save`)
    setOpen(false)
    setRows([])
    onDone()
  }

  const assignedCount = rows.filter(r => r.supplierId).length
  const unassignedCount = rows.length - assignedCount

  const columns = [
    {
      title: 'Beneficiary Name', key: 'bene', width: 160,
      render: (_: any, r: any) => (
        <div>
          <div style={{ fontWeight: 600, fontSize: 12 }}>{r.beneName || '-'}</div>
          {r.beneAcct && <div style={{ color: '#888', fontSize: 11 }}>A/C: {r.beneAcct}</div>}
          {r.beneIfsc && <div style={{ color: '#888', fontSize: 11 }}>IFSC: {r.beneIfsc}</div>}
        </div>
      ),
    },
    {
      title: 'Amount', dataIndex: 'amount', key: 'amt', width: 110, align: 'right' as const,
      render: (v: number) => <b style={{ color: '#cf1322' }}>{formatINR(v)}</b>,
    },
    {
      title: 'Date', dataIndex: 'paymentDate', key: 'date', width: 95,
      render: (v: string) => v ? dayjs(v).format('DD/MM/YYYY') : <span style={{ color: '#f5222d' }}>?</span>,
    },
    {
      title: 'Mode', dataIndex: 'mode', key: 'mode', width: 70,
      render: (v: string) => <Tag color={modeColor[v?.toUpperCase()] ?? 'default'}>{v || '-'}</Tag>,
    },
    {
      title: 'UTR / Ref', key: 'ref', width: 120,
      render: (_: any, r: any) => <span style={{ fontSize: 11, color: '#555' }}>{r.utr || r.custRef || '-'}</span>,
    },
    {
      title: 'Status', dataIndex: 'status', key: 'status', width: 85,
      render: (v: string) => {
        const s = v?.toLowerCase()
        if (s === 'success') return <Tag color="green" icon={<CheckCircleOutlined />}>Success</Tag>
        if (s === 'failed' || s === 'failure') return <Tag color="red" icon={<CloseCircleOutlined />}>Failed</Tag>
        return <Tag>{v || '-'}</Tag>
      },
    },
    {
      title: 'Remark', dataIndex: 'remark', key: 'remark', width: 140, ellipsis: true,
      render: (v: string) => <span style={{ fontSize: 11 }}>{v || '-'}</span>,
    },
    {
      title: <span style={{ color: '#cf1322' }}>* Assign Supplier</span>,
      key: 'supplier', width: 200,
      render: (_: any, r: any) => (
        <Select
          placeholder="Select supplier…"
          style={{ width: '100%' }}
          value={r.supplierId ?? undefined}
          allowClear
          showSearch
          optionFilterProp="label"
          options={(suppliers as any[]).map((s: any) => ({ value: s.id, label: s.name }))}
          onChange={v => setSupplier(r._key, v ?? null)}
          size="small"
          status={!r.supplierId ? 'warning' : undefined}
        />
      ),
    },
  ]

  return (
    <>
      <Upload
        accept=".xlsx,.xls,.csv"
        showUploadList={false}
        beforeUpload={handleFile}
      >
        <Button icon={<BankOutlined />}>Import Bank Statement</Button>
      </Upload>

      <Modal
        title={<Space><BankOutlined />Import ICICI Bank Payments</Space>}
        open={open}
        onCancel={() => { setOpen(false); setRows([]) }}
        width={1100}
        footer={
          <Space style={{ justifyContent: 'space-between', width: '100%' }}>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {assignedCount} assigned · {unassignedCount} unassigned (will be skipped)
            </Text>
            <Space>
              <Button onClick={() => { setOpen(false); setRows([]) }}>Cancel</Button>
              <Button
                type="primary"
                loading={saving}
                disabled={assignedCount === 0}
                onClick={handleSave}
              >
                Record {assignedCount} Payment{assignedCount !== 1 ? 's' : ''}
              </Button>
            </Space>
          </Space>
        }
      >
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 12 }}
          message={`${rows.length} payment rows parsed from the bank file. Assign a supplier to each row you want to record. Rows without a supplier will be skipped.`}
        />
        {unassignedCount > 0 && (
          <Alert
            type="warning"
            showIcon
            style={{ marginBottom: 12 }}
            message={`${unassignedCount} row${unassignedCount > 1 ? 's' : ''} still need a supplier assigned.`}
          />
        )}
        <Table
          dataSource={rows}
          columns={columns}
          rowKey="_key"
          size="small"
          pagination={false}
          scroll={{ x: 1000, y: 420 }}
          rowClassName={(r) => !r.supplierId ? 'import-row-unassigned' : ''}
        />
      </Modal>
    </>
  )
}
