import { useState } from 'react'
import {
  Modal, Button, Table, Select, Tag, Alert, Space, Typography, Upload,
  message as antMessage, Tabs, Row, Col, Statistic, Checkbox,
} from 'antd'
import { BankOutlined, ArrowDownOutlined, ArrowUpOutlined, EyeOutlined } from '@ant-design/icons'
import {
  useSuppliers, useCustomers,
  useCreateSupplierPayment, useCreateCustomerReceipt,
} from '../../api/hooks'
import { formatINR } from '../../utils/format'
import dayjs from 'dayjs'
import api from '../../api/client'

const { Text } = Typography

// ── Types ─────────────────────────────────────────────────────────────────────
interface ParsedRow {
  si: number
  tranId: string
  txnDate: string        // YYYY-MM-DD
  remarks: string
  withdrawal: number     // Dr
  deposit: number        // Cr
  balance: number
  mode: string
}

interface MappedRow extends ParsedRow {
  _key: number
  selected: boolean
  supplierId: string | null
  customerId: string | null
}

const modeColor: Record<string, string> = {
  UPI: 'cyan', NEFT: 'blue', RTGS: 'purple', IMPS: 'geekblue', OTHER: 'default',
}

// ── Auto name match helpers ───────────────────────────────────────────────────
function extractName(remarks: string): string {
  const parts = remarks.split('/')
  if (parts.length >= 3) {
    for (let i = parts.length - 1; i >= 2; i--) {
      const p = parts[i].trim()
      if (/^[A-Z]{4}[0-9]/i.test(p)) continue          // IFSC codes
      if (/^[0-9a-f]{8,}$/i.test(p)) continue           // hex
      if (p.length > 3 && /[a-zA-Z]/.test(p))
        return p.split('@')[0].replace(/-\d+$/, '').trim()
    }
  }
  return remarks.substring(0, 50)
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function ImportBankStatement({ onDone }: { onDone: () => void }) {
  const [previewOpen, setPreviewOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [rows, setRows] = useState<MappedRow[]>([])
  const [saving, setSaving] = useState(false)
  const [parsing, setParsing] = useState(false)
  const [debugText, setDebugText] = useState('')
  const [showDebug, setShowDebug] = useState(false)

  const { data: suppliers = [] } = useSuppliers()
  const { data: customers = [] } = useCustomers()
  const { mutateAsync: createPayment } = useCreateSupplierPayment()
  const { mutateAsync: createReceipt } = useCreateCustomerReceipt()

  async function handleFile(file: File) {
    setParsing(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const resp = await api.post('/parse-bank-statement', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })

      const parsed: ParsedRow[] = resp.data.rows || []
      setDebugText((resp.data.debug || '') + '\n\n--- chars 3000-6000 ---\n' + (resp.data.flatSample || ''))

      if (!parsed.length) {
        antMessage.error('No transactions found. See debug info.')
        setShowDebug(true)
        setParsing(false)
        return
      }

      // Build name lookup maps for auto-match
      const supplierByName: Record<string, string> = {}
      for (const s of suppliers as any[]) {
        supplierByName[s.name.toLowerCase()] = s.id
      }
      const customerByName: Record<string, string> = {}
      for (const c of customers as any[]) {
        customerByName[c.name.toLowerCase()] = c.id
      }

      const mapped: MappedRow[] = parsed.map((r, i) => {
        const nameLower = extractName(r.remarks).toLowerCase()
        let supplierId: string | null = null
        let customerId: string | null = null

        if (r.withdrawal > 0) {
          for (const [name, id] of Object.entries(supplierByName)) {
            if (nameLower.includes(name) || name.includes(nameLower)) { supplierId = id; break }
          }
        } else if (r.deposit > 0) {
          for (const [name, id] of Object.entries(customerByName)) {
            if (nameLower.includes(name) || name.includes(nameLower)) { customerId = id; break }
          }
        }

        return {
          ...r,
          _key: i,
          // Auto-select rows that have a valid amount; deselect pure bank charges (no supplier/customer and tiny amounts)
          selected: true,
          supplierId,
          customerId,
        }
      })

      setRows(mapped)
      setPreviewOpen(true)
    } catch (err: any) {
      antMessage.error(`Failed to parse: ${err?.response?.data?.error ?? err?.message ?? 'Unknown error'}`)
    } finally {
      setParsing(false)
    }
    return false
  }

  function setField(key: number, field: keyof MappedRow, value: any) {
    setRows(prev => prev.map(r => r._key === key ? { ...r, [field]: value } : r))
  }

  function toggleAll(checked: boolean) {
    setRows(prev => prev.map(r => ({ ...r, selected: checked })))
  }

  // ── Save ──────────────────────────────────────────────────────────────────────
  async function handleSave() {
    const toSave = rows.filter(r => r.selected)
    const debits  = toSave.filter(r => r.withdrawal > 0 && r.supplierId)
    const credits = toSave.filter(r => r.deposit > 0 && r.customerId)

    if (!debits.length && !credits.length) {
      antMessage.warning('Assign at least one supplier (for debits) or customer (for credits) before saving')
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
          referenceNumber: r.tranId || '',
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
          referenceNumber: r.tranId || '',
          notes: r.remarks.substring(0, 200),
        })
        saved++
      } catch { failed++ }
    }

    setSaving(false)
    if (saved) antMessage.success(`${saved} transaction${saved > 1 ? 's' : ''} recorded`)
    if (failed) antMessage.error(`${failed} failed to save`)
    setImportOpen(false)
    setPreviewOpen(false)
    setRows([])
    onDone()
  }

  // ── Derived stats ─────────────────────────────────────────────────────────────
  const debits  = rows.filter(r => r.withdrawal > 0)
  const credits = rows.filter(r => r.deposit > 0)
  const neither = rows.filter(r => !r.withdrawal && !r.deposit)
  const selectedDebits   = debits.filter(r => r.selected && r.supplierId)
  const selectedCredits  = credits.filter(r => r.selected && r.customerId)

  // ── PREVIEW TABLE (all rows, select what to import) ───────────────────────────
  const previewCols = [
    {
      title: <Checkbox onChange={e => toggleAll(e.target.checked)} defaultChecked />,
      key: 'sel', width: 40,
      render: (_: any, r: MappedRow) => (
        <Checkbox checked={r.selected} onChange={e => setField(r._key, 'selected', e.target.checked)} />
      ),
    },
    { title: '#', dataIndex: 'si', key: 'si', width: 40 },
    {
      title: 'Date', dataIndex: 'txnDate', key: 'date', width: 90,
      render: (v: string) => v ? dayjs(v).format('DD/MM/YY') : <span style={{ color: '#f5222d' }}>?</span>,
    },
    {
      title: 'Mode', dataIndex: 'mode', key: 'mode', width: 65,
      render: (v: string) => <Tag color={modeColor[v] ?? 'default'} style={{ fontSize: 10 }}>{v}</Tag>,
    },
    {
      title: 'Remarks', dataIndex: 'remarks', key: 'remarks',
      render: (v: string) => <span style={{ fontSize: 11, color: '#555' }}>{v.substring(0, 80)}{v.length > 80 ? '…' : ''}</span>,
    },
    {
      title: 'Dr (₹)', dataIndex: 'withdrawal', key: 'dr', width: 110, align: 'right' as const,
      render: (v: number) => v ? <b style={{ color: '#cf1322' }}>{formatINR(v)}</b> : <span style={{ color: '#ccc' }}>—</span>,
    },
    {
      title: 'Cr (₹)', dataIndex: 'deposit', key: 'cr', width: 110, align: 'right' as const,
      render: (v: number) => v ? <b style={{ color: '#2e7d32' }}>{formatINR(v)}</b> : <span style={{ color: '#ccc' }}>—</span>,
    },
    {
      title: 'Type',
      key: 'type', width: 80,
      render: (_: any, r: MappedRow) => {
        if (r.withdrawal > 0) return <Tag color="red" style={{ fontSize: 10 }}>Supplier Dr</Tag>
        if (r.deposit > 0) return <Tag color="green" style={{ fontSize: 10 }}>Customer Cr</Tag>
        return <Tag color="default" style={{ fontSize: 10 }}>Other</Tag>
      },
    },
  ]

  // ── MAPPING TABLE (only selected rows with Dr/Cr) ─────────────────────────────
  const debitMapCols = [
    { title: '#', dataIndex: 'si', key: 'si', width: 40 },
    {
      title: 'Date', dataIndex: 'txnDate', key: 'date', width: 90,
      render: (v: string) => v ? dayjs(v).format('DD/MM/YY') : <span style={{ color: '#f5222d' }}>?</span>,
    },
    { title: 'Mode', dataIndex: 'mode', key: 'mode', width: 65, render: (v: string) => <Tag color={modeColor[v] ?? 'default'} style={{ fontSize: 10 }}>{v}</Tag> },
    {
      title: 'Remarks', key: 'remarks',
      render: (_: any, r: MappedRow) => (
        <div>
          <div style={{ fontSize: 12, fontWeight: 600 }}>{extractName(r.remarks)}</div>
          <div style={{ fontSize: 10, color: '#888', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 240 }}>{r.remarks}</div>
        </div>
      ),
    },
    {
      title: 'Amount (Dr)', dataIndex: 'withdrawal', key: 'amt', width: 120, align: 'right' as const,
      render: (v: number) => <b style={{ color: '#cf1322' }}>{formatINR(v)}</b>,
    },
    {
      title: <span style={{ color: '#cf1322' }}>Map to Supplier *</span>,
      key: 'supplier', width: 220,
      render: (_: any, r: MappedRow) => (
        <Select
          placeholder="Select supplier…"
          style={{ width: '100%' }}
          value={r.supplierId ?? undefined}
          allowClear showSearch optionFilterProp="label"
          options={(suppliers as any[]).map((s: any) => ({ value: s.id, label: s.name }))}
          onChange={v => setField(r._key, 'supplierId', v ?? null)}
          size="small"
          status={!r.supplierId ? 'warning' : undefined}
        />
      ),
    },
  ]

  const creditMapCols = [
    { title: '#', dataIndex: 'si', key: 'si', width: 40 },
    {
      title: 'Date', dataIndex: 'txnDate', key: 'date', width: 90,
      render: (v: string) => v ? dayjs(v).format('DD/MM/YY') : <span style={{ color: '#f5222d' }}>?</span>,
    },
    { title: 'Mode', dataIndex: 'mode', key: 'mode', width: 65, render: (v: string) => <Tag color={modeColor[v] ?? 'default'} style={{ fontSize: 10 }}>{v}</Tag> },
    {
      title: 'Remarks', key: 'remarks',
      render: (_: any, r: MappedRow) => (
        <div>
          <div style={{ fontSize: 12, fontWeight: 600 }}>{extractName(r.remarks)}</div>
          <div style={{ fontSize: 10, color: '#888', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 240 }}>{r.remarks}</div>
        </div>
      ),
    },
    {
      title: 'Amount (Cr)', dataIndex: 'deposit', key: 'amt', width: 120, align: 'right' as const,
      render: (v: number) => <b style={{ color: '#2e7d32' }}>{formatINR(v)}</b>,
    },
    {
      title: <span style={{ color: '#2e7d32' }}>Map to Customer *</span>,
      key: 'customer', width: 220,
      render: (_: any, r: MappedRow) => (
        <Select
          placeholder="Select customer…"
          style={{ width: '100%' }}
          value={r.customerId ?? undefined}
          allowClear showSearch optionFilterProp="label"
          options={(customers as any[]).map((c: any) => ({ value: c.id, label: c.name }))}
          onChange={v => setField(r._key, 'customerId', v ?? null)}
          size="small"
          status={!r.customerId ? 'warning' : undefined}
        />
      ),
    },
  ]

  const selectedDebitRows  = rows.filter(r => r.selected && r.withdrawal > 0)
  const selectedCreditRows = rows.filter(r => r.selected && r.deposit > 0)

  return (
    <>
      <Upload
        accept=".pdf,.xlsx,.xls,.csv"
        showUploadList={false}
        beforeUpload={file => { handleFile(file); return false }}
      >
        <Button icon={<BankOutlined />} loading={parsing}>
          Import Bank Statement
        </Button>
      </Upload>

      {/* ── STEP 1: Preview all rows, select what to import ── */}
      <Modal
        title={<Space><EyeOutlined /> Preview — {rows.length} transactions found</Space>}
        open={previewOpen}
        onCancel={() => { setPreviewOpen(false); setRows([]) }}
        width={1100}
        styles={{ body: { padding: '12px 16px' } }}
        footer={
          <Space style={{ justifyContent: 'space-between', width: '100%' }}>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {rows.filter(r => r.selected).length} of {rows.length} rows selected
              &nbsp;·&nbsp; {debits.length} debits (Dr) &nbsp;·&nbsp; {credits.length} credits (Cr) &nbsp;·&nbsp; {neither.length} other
            </Text>
            <Space>
              <Button onClick={() => { setPreviewOpen(false); setRows([]) }}>Cancel</Button>
              <Button
                type="primary"
                disabled={!rows.some(r => r.selected && (r.withdrawal > 0 || r.deposit > 0))}
                onClick={() => { setPreviewOpen(false); setImportOpen(true) }}
              >
                Map & Import Selected →
              </Button>
            </Space>
          </Space>
        }
      >
        <Alert
          type="info" showIcon style={{ marginBottom: 10, fontSize: 11 }}
          message="Check the rows you want to import. Deselect bank charges, internal transfers, or anything that isn't a supplier payment or customer receipt."
        />
        {showDebug && debugText && (
          <details style={{ marginBottom: 10, fontSize: 11 }}>
            <summary style={{ cursor: 'pointer', color: '#888' }}>Raw PDF text (debug)</summary>
            <pre style={{ fontSize: 10, whiteSpace: 'pre-wrap', maxHeight: 200, overflow: 'auto', background: '#f5f5f5', padding: 8 }}>{debugText}</pre>
          </details>
        )}
        <Table
          dataSource={rows}
          columns={previewCols}
          rowKey="_key"
          size="small"
          pagination={false}
          scroll={{ x: 900, y: 440 }}
          rowClassName={(r: MappedRow) => !r.selected ? 'import-row-skipped' : ''}
        />
      </Modal>

      {/* ── STEP 2: Map selected Dr/Cr rows to supplier/customer ── */}
      <Modal
        title={<Space><BankOutlined /> Map Transactions to Suppliers / Customers</Space>}
        open={importOpen}
        onCancel={() => { setImportOpen(false); setPreviewOpen(true) }}
        width={1050}
        styles={{ body: { padding: '12px 16px' } }}
        footer={
          <Space style={{ justifyContent: 'space-between', width: '100%' }}>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {selectedDebits.filter(r => r.supplierId).length}/{selectedDebitRows.length} supplier payments ready
              &nbsp;·&nbsp;
              {selectedCredits.filter(r => r.customerId).length}/{selectedCreditRows.length} customer receipts ready
            </Text>
            <Space>
              <Button onClick={() => { setImportOpen(false); setPreviewOpen(true) }}>← Back</Button>
              <Button
                type="primary"
                loading={saving}
                disabled={!selectedDebits.some(r => r.supplierId) && !selectedCredits.some(r => r.customerId)}
                onClick={handleSave}
              >
                Save {selectedDebits.filter(r=>r.supplierId).length + selectedCredits.filter(r=>r.customerId).length} Transactions
              </Button>
            </Space>
          </Space>
        }
      >
        <Row gutter={12} style={{ marginBottom: 12 }}>
          <Col span={6}>
            <Statistic
              title="Withdrawals (Dr) selected"
              value={formatINR(selectedDebitRows.reduce((s, r) => s + r.withdrawal, 0))}
              valueStyle={{ fontSize: 15, color: '#cf1322' }}
              suffix={<span style={{ fontSize: 11, color: '#888' }}>{selectedDebitRows.length} rows</span>}
            />
          </Col>
          <Col span={6}>
            <Statistic
              title="Deposits (Cr) selected"
              value={formatINR(selectedCreditRows.reduce((s, r) => s + r.deposit, 0))}
              valueStyle={{ fontSize: 15, color: '#2e7d32' }}
              suffix={<span style={{ fontSize: 11, color: '#888' }}>{selectedCreditRows.length} rows</span>}
            />
          </Col>
          <Col span={12}>
            <Alert
              type="warning" showIcon style={{ fontSize: 11 }}
              message="Rows without a mapped supplier/customer will be skipped. You can go back to deselect rows you don't want."
            />
          </Col>
        </Row>

        <Tabs
          size="small"
          items={[
            {
              key: 'debits',
              label: <span><ArrowDownOutlined style={{ color: '#cf1322' }} /> Supplier Payments ({selectedDebitRows.length})</span>,
              children: selectedDebitRows.length ? (
                <Table
                  dataSource={selectedDebitRows}
                  columns={debitMapCols}
                  rowKey="_key"
                  size="small"
                  pagination={false}
                  scroll={{ x: 800, y: 380 }}
                />
              ) : <Alert type="info" message="No debit rows selected." style={{ fontSize: 11 }} />,
            },
            {
              key: 'credits',
              label: <span><ArrowUpOutlined style={{ color: '#2e7d32' }} /> Customer Receipts ({selectedCreditRows.length})</span>,
              children: selectedCreditRows.length ? (
                <Table
                  dataSource={selectedCreditRows}
                  columns={creditMapCols}
                  rowKey="_key"
                  size="small"
                  pagination={false}
                  scroll={{ x: 800, y: 380 }}
                />
              ) : <Alert type="info" message="No credit rows selected." style={{ fontSize: 11 }} />,
            },
          ]}
        />
      </Modal>
    </>
  )
}
