import { useState } from 'react'
import {
  Modal, Button, Upload, Table, Form, Select, InputNumber,
  Alert, Steps, Space, Typography, Tag, Tooltip, message, Spin, Switch
} from 'antd'
import { InboxOutlined, CheckCircleOutlined, WarningOutlined } from '@ant-design/icons'
import api from '../../api/client'
import { useCreateDelivery, useSuppliers, usePurchaseOrders, useSalesOrders, useCustomers } from '../../api/hooks'
import dayjs from 'dayjs'
import customParseFormat from 'dayjs/plugin/customParseFormat'
dayjs.extend(customParseFormat)

const { Text } = Typography

function parseDate(s: string): string {
  if (!s) return dayjs().format('YYYY-MM-DD')
  const d = dayjs(s, ['DD-MMM-YY', 'DD-MMM-YYYY', 'DD/MM/YYYY', 'YYYY-MM-DD'], true)
  return d.isValid() ? d.format('YYYY-MM-DD') : dayjs().format('YYYY-MM-DD')
}

interface ParsedRow {
  key: string
  challanNo: string
  inDate: string
  outDate: string
  vehicleNumber: string
  product: string
  grossWeightKg: number
  tareWeightKg: number
  netWeightKg: number
  grossWeight: number  // quintals
  tareWeight: number
  netWeight: number
  // user-filled
  supplierId?: string
  purchaseOrderId?: string
  customerId?: string
  salesOrderId?: string
  purchaseRate?: number   // ₹ per quintal
  saleRate?: number
  // cess
  cessApplicable: boolean
  cessPaid?: number       // ₹ paid so far
  balanceCess?: number    // outstanding cess
  // moisture / quality
  mcPct?: number          // MC content %
  qualityDeductionPct?: number
  status: 'pending' | 'ready' | 'saved' | 'error'
  error?: string
}

// Calculated display values (not stored in ParsedRow, derived on render)
function calcRow(r: ParsedRow) {
  const netQt = r.netWeight  // quintals
  const rate = r.purchaseRate ?? 0
  const grossAmt = netQt * rate
  const balCess = r.cessApplicable ? (r.balanceCess ?? 0) : 0
  const mcDeduction = r.mcPct ? grossAmt * (r.mcPct / 100) : 0
  const netPayable = grossAmt - balCess - mcDeduction
  return { grossAmt, mcDeduction, netPayable, balCess }
}

interface Props {
  open: boolean
  onClose: () => void
  onDone: () => void
}

export default function ImportWeighingReport({ open, onClose, onDone }: Props) {
  const [step, setStep] = useState(0)
  const [parsing, setParsing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [rows, setRows] = useState<ParsedRow[]>([])
  const [globalForm] = Form.useForm()

  const { data: suppliers = [] } = useSuppliers()
  const { data: pos = [] } = usePurchaseOrders()
  const { data: sos = [] } = useSalesOrders()
  const { data: customers = [] } = useCustomers()
  const { mutateAsync: createDelivery } = useCreateDelivery()

  function reset() {
    setStep(0); setRows([]); globalForm.resetFields()
  }

  async function handleUpload(file: File) {
    setParsing(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const resp = await api.post('/parse-weighing-report', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      const parsed: ParsedRow[] = (resp.data.rows || []).map((r: any, i: number) => ({
        ...r,
        key: `${i}-${r.challanNo}`,
        cessApplicable: false,
        qualityDeductionPct: 0,
        status: 'ready',
      }))
      if (parsed.length === 0) {
        const debug = resp.data.debug || '(no text extracted)'
        Modal.error({
          title: 'Could not find delivery rows',
          content: (
            <div>
              <p>The PDF was read but no rows matched. Raw extracted text (first 2000 chars):</p>
              <pre style={{ fontSize: 10, whiteSpace: 'pre-wrap', maxHeight: 400, overflow: 'auto', background: '#f5f5f5', padding: 8 }}>{debug}</pre>
            </div>
          ),
          width: 800,
        })
        setParsing(false)
        return false
      }
      setRows(parsed)
      setStep(1)
    } catch (e: any) {
      message.error(`Failed to parse PDF: ${e?.response?.data?.error || e.message}`)
    }
    setParsing(false)
    return false
  }

  function applyGlobal() {
    const vals = globalForm.getFieldsValue()
    setRows(prev => prev.map(r => ({
      ...r,
      supplierId: vals.supplierId ?? r.supplierId,
      purchaseOrderId: vals.purchaseOrderId ?? r.purchaseOrderId,
      customerId: vals.customerId ?? r.customerId,
      salesOrderId: vals.salesOrderId ?? r.salesOrderId,
      purchaseRate: vals.purchaseRate ?? r.purchaseRate,
      saleRate: vals.saleRate ?? r.saleRate,
      mcPct: vals.mcPct ?? r.mcPct,
      cessApplicable: vals.cessApplicable !== undefined ? vals.cessApplicable : r.cessApplicable,
      cessPaid: vals.cessPaid ?? r.cessPaid,
      balanceCess: vals.balanceCess ?? r.balanceCess,
      qualityDeductionPct: vals.qualityDeductionPct ?? r.qualityDeductionPct,
      status: 'ready',
    })))
  }

  function upd(key: string, field: string, value: any) {
    setRows(prev => prev.map(r => {
      if (r.key !== key) return r
      return { ...r, [field]: value, status: r.status === 'saved' ? 'saved' : 'ready' }
    }))
  }

  async function saveAll() {
    setSaving(true)
    let saved = 0, errors = 0
    const updated = [...rows]
    for (let i = 0; i < updated.length; i++) {
      const r = updated[i]
      if (r.status === 'saved') continue
      const { mcDeduction } = calcRow(r)
      try {
        await createDelivery({
          deliveryDate: parseDate(r.outDate),
          vehicleNumber: r.vehicleNumber || 'N/A',
          supplierId: r.supplierId,
          purchaseOrderId: r.purchaseOrderId,
          customerId: r.customerId || null,
          salesOrderId: r.salesOrderId || null,
          grossWeight: r.grossWeight,
          tareWeight: r.tareWeight,
          purchaseRate: r.purchaseRate,
          saleRate: r.saleRate || null,
          moisturePct: r.mcPct || null,
          qualityDeductionPct: r.qualityDeductionPct || 0,
          cessApplicable: r.cessApplicable,
          cessPaid: r.cessApplicable ? (r.cessPaid ?? null) : null,
          balanceCess: r.cessApplicable ? (r.balanceCess ?? null) : null,
          lrNumber: r.challanNo,
          notes: `Imported from Sarvani weighing report. Challan: ${r.challanNo}`,
          status: 'COMPLETED',
        })
        updated[i] = { ...r, status: 'saved' }
        saved++
      } catch (e: any) {
        updated[i] = { ...r, status: 'error', error: e?.response?.data?.error || e.message }
        errors++
      }
      setRows([...updated])
    }
    setSaving(false)
    if (errors === 0) {
      message.success(`${saved} deliveries imported successfully`)
      setStep(2)
      onDone()
    } else {
      message.warning(`${saved} saved, ${errors} failed. Fix errors and retry.`)
    }
  }

  const savedCount = rows.filter(r => r.status === 'saved').length
  const errorCount = rows.filter(r => r.status === 'error').length
  const pendingCount = rows.filter(r => r.status !== 'saved').length

  const fmtAmt = (n: number) => n ? `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 0 })}` : '—'

  const columns = [
    {
      title: 'Challan No', dataIndex: 'challanNo', width: 110, fixed: 'left' as const,
      render: (v: string) => <Text code style={{ fontSize: 11 }}>{v}</Text>
    },
    {
      title: 'Out Date', dataIndex: 'outDate', width: 95,
      render: (v: string) => <Text style={{ fontSize: 12 }}>{v}</Text>
    },
    {
      title: 'Vehicle', dataIndex: 'vehicleNumber', width: 115,
      render: (v: string, r: ParsedRow) => (
        <input
          defaultValue={v}
          placeholder="e.g. AP07TF1234"
          title="Vehicle number"
          onBlur={e => upd(r.key, 'vehicleNumber', e.target.value)}
          style={{ width: '100%', border: '1px solid #d9d9d9', borderRadius: 4, padding: '1px 4px', fontSize: 12 }}
        />
      )
    },
    {
      title: 'Net Wt (Qt)', dataIndex: 'netWeight', width: 90,
      render: (v: number) => <Text strong style={{ fontSize: 12 }}>{v?.toFixed(3)}</Text>
    },
    {
      title: 'Supplier', key: 'supplier', width: 170,
      render: (_: any, r: ParsedRow) => (
        <Select size="small" placeholder="Supplier" style={{ width: '100%' }} showSearch optionFilterProp="label"
          value={r.supplierId} onChange={v => upd(r.key, 'supplierId', v)}
          options={suppliers.map((s: any) => ({ value: s.id, label: s.name }))} allowClear />
      )
    },
    {
      title: 'PO', key: 'po', width: 140,
      render: (_: any, r: ParsedRow) => (
        <Select size="small" placeholder="PO" style={{ width: '100%' }} showSearch optionFilterProp="label"
          value={r.purchaseOrderId} onChange={v => upd(r.key, 'purchaseOrderId', v)}
          options={pos.filter((p: any) => !r.supplierId || p.supplierId === r.supplierId)
            .map((p: any) => ({ value: p.id, label: p.poNumber }))} allowClear />
      )
    },
    {
      title: 'Rate (₹/Qt)', key: 'rate', width: 110,
      render: (_: any, r: ParsedRow) => (
        <InputNumber size="small" min={0} step={0.5} placeholder="Rate"
          value={r.purchaseRate} onChange={v => upd(r.key, 'purchaseRate', v ?? undefined)}
          style={{ width: '100%' }} />
      )
    },
    {
      title: 'Gross Amt', key: 'grossAmt', width: 100,
      render: (_: any, r: ParsedRow) => {
        const { grossAmt } = calcRow(r)
        return <Text style={{ fontSize: 12, color: grossAmt ? '#000' : '#aaa' }}>{grossAmt ? fmtAmt(grossAmt) : '—'}</Text>
      }
    },
    {
      title: 'Cess?', key: 'cess', width: 65,
      render: (_: any, r: ParsedRow) => (
        <Switch size="small" checked={r.cessApplicable}
          onChange={v => upd(r.key, 'cessApplicable', v)}
          checkedChildren="Y" unCheckedChildren="N" />
      )
    },
    {
      title: 'Cess Paid', key: 'cessPaid', width: 100,
      render: (_: any, r: ParsedRow) => r.cessApplicable ? (
        <InputNumber size="small" min={0} placeholder="Paid"
          value={r.cessPaid} onChange={v => upd(r.key, 'cessPaid', v ?? undefined)}
          style={{ width: '100%' }} />
      ) : <Text style={{ color: '#ccc', fontSize: 12 }}>N/A</Text>
    },
    {
      title: 'Bal Cess', key: 'balCess', width: 100,
      render: (_: any, r: ParsedRow) => r.cessApplicable ? (
        <InputNumber size="small" min={0} placeholder="Balance"
          value={r.balanceCess} onChange={v => upd(r.key, 'balanceCess', v ?? undefined)}
          style={{ width: '100%' }} />
      ) : <Text style={{ color: '#ccc', fontSize: 12 }}>N/A</Text>
    },
    {
      title: 'MC %', key: 'mc', width: 85,
      render: (_: any, r: ParsedRow) => (
        <InputNumber size="small" min={0} max={100} step={0.1} placeholder="14.5"
          value={r.mcPct} onChange={v => upd(r.key, 'mcPct', v ?? undefined)}
          style={{ width: '100%' }} />
      )
    },
    {
      title: 'MC Deduction', key: 'mcDed', width: 105,
      render: (_: any, r: ParsedRow) => {
        const { mcDeduction } = calcRow(r)
        return <Text style={{ fontSize: 12, color: mcDeduction ? '#cf1322' : '#aaa' }}>{mcDeduction ? fmtAmt(mcDeduction) : '—'}</Text>
      }
    },
    {
      title: 'Net Payable', key: 'netPay', width: 105,
      render: (_: any, r: ParsedRow) => {
        const { netPayable, grossAmt } = calcRow(r)
        return <Text strong style={{ fontSize: 12, color: grossAmt ? '#389e0d' : '#aaa' }}>{grossAmt ? fmtAmt(netPayable) : '—'}</Text>
      }
    },
    {
      title: 'Status', key: 'status', width: 80, fixed: 'right' as const,
      render: (_: any, r: ParsedRow) => {
        if (r.status === 'saved') return <Tag color="green" icon={<CheckCircleOutlined />}>Saved</Tag>
        if (r.status === 'error') return <Tooltip title={r.error}><Tag color="red" icon={<WarningOutlined />}>Error</Tag></Tooltip>
        return <Tag color="blue">Ready</Tag>
      }
    },
  ]

  return (
    <Modal
      title="Import Sarvani Weighing Report"
      open={open}
      onCancel={() => { reset(); onClose() }}
      width={1400}
      footer={null}
      destroyOnClose
    >
      <Steps
        current={step}
        items={[
          { title: 'Upload PDF' },
          { title: 'Review & Fill Details' },
          { title: 'Done' },
        ]}
        style={{ marginBottom: 24 }}
      />

      {step === 0 && (
        <Spin spinning={parsing} tip="Parsing PDF...">
          <Upload.Dragger
            accept=".pdf"
            beforeUpload={handleUpload}
            showUploadList={false}
            disabled={parsing}
            style={{ padding: 32 }}
          >
            <p className="ant-upload-drag-icon"><InboxOutlined style={{ fontSize: 48, color: '#1677ff' }} /></p>
            <p className="ant-upload-text">Click or drag the Sarvani weighing report PDF here</p>
            <p className="ant-upload-hint" style={{ color: '#888' }}>
              The "Consignor Wise Finished Weighing Trs Detailed Report" from Sarvani Bio Fuels.<br />
              Each row (truck load) will be extracted and pre-filled into a delivery record.
            </p>
          </Upload.Dragger>
        </Spin>
      )}

      {step === 1 && (
        <>
          <Alert type="info" showIcon
            message={`${rows.length} truck loads found. Fill in common values below, then review each row inline.`}
            style={{ marginBottom: 12 }}
          />

          {/* Global apply bar */}
          <div style={{ background: '#f0f5ff', padding: '12px 16px', borderRadius: 8, marginBottom: 12 }}>
            <Text strong style={{ display: 'block', marginBottom: 8 }}>Apply to all rows:</Text>
            <Form form={globalForm} layout="inline" size="small">
              <Form.Item label="Supplier" name="supplierId" style={{ marginBottom: 6 }}>
                <Select placeholder="Supplier" style={{ width: 160 }} showSearch optionFilterProp="label" allowClear
                  options={suppliers.map((s: any) => ({ value: s.id, label: s.name }))} />
              </Form.Item>
              <Form.Item label="PO" name="purchaseOrderId" style={{ marginBottom: 6 }}>
                <Select placeholder="PO" style={{ width: 140 }} showSearch optionFilterProp="label" allowClear
                  options={pos.map((p: any) => ({ value: p.id, label: p.poNumber }))} />
              </Form.Item>
              <Form.Item label="Rate (₹/Qt)" name="purchaseRate" style={{ marginBottom: 6 }}>
                <InputNumber placeholder="e.g. 1847" min={0} step={0.5} style={{ width: 100 }} />
              </Form.Item>
              <Form.Item label="MC %" name="mcPct" style={{ marginBottom: 6 }}>
                <InputNumber placeholder="e.g. 14.5" min={0} max={100} step={0.1} style={{ width: 85 }} />
              </Form.Item>
              <Form.Item label="Cess?" name="cessApplicable" valuePropName="checked" style={{ marginBottom: 6 }}>
                <Switch size="small" checkedChildren="Y" unCheckedChildren="N" />
              </Form.Item>
              <Form.Item label="Cess Paid" name="cessPaid" style={{ marginBottom: 6 }}>
                <InputNumber placeholder="0" min={0} style={{ width: 90 }} />
              </Form.Item>
              <Form.Item label="Bal Cess" name="balanceCess" style={{ marginBottom: 6 }}>
                <InputNumber placeholder="0" min={0} style={{ width: 90 }} />
              </Form.Item>
              <Form.Item label="Sale Rate" name="saleRate" style={{ marginBottom: 6 }}>
                <InputNumber placeholder="e.g. 1900" min={0} step={0.5} style={{ width: 100 }} />
              </Form.Item>
              <Form.Item style={{ marginBottom: 6 }}>
                <Button type="primary" size="small" onClick={applyGlobal}>Apply to All</Button>
              </Form.Item>
            </Form>
          </div>

          <Space style={{ marginBottom: 8 }}>
            <Tag color="blue">{pendingCount} Pending</Tag>
            {savedCount > 0 && <Tag color="green">{savedCount} Saved</Tag>}
            {errorCount > 0 && <Tag color="red">{errorCount} Errors</Tag>}
            <Text type="secondary" style={{ fontSize: 12 }}>Net Payable = Gross Amt − Balance Cess − MC Deduction</Text>
          </Space>

          <Table
            dataSource={rows}
            columns={columns}
            rowKey="key"
            size="small"
            pagination={false}
            scroll={{ x: 1500, y: 420 }}
            rowClassName={(r: ParsedRow) => r.status === 'error' ? 'ant-table-row-error' : ''}
          />

          <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <Button onClick={() => { reset(); onClose() }}>Cancel</Button>
            <Button type="primary" loading={saving}
              disabled={pendingCount === 0}
              onClick={saveAll}
            >
              Import {pendingCount} Deliveries
            </Button>
          </div>
        </>
      )}

      {step === 2 && (
        <div style={{ textAlign: 'center', padding: 48 }}>
          <CheckCircleOutlined style={{ fontSize: 64, color: '#52c41a' }} />
          <Typography.Title level={3} style={{ marginTop: 16 }}>Import Complete</Typography.Title>
          <Text type="secondary">{savedCount} delivery records created successfully.</Text>
          <br /><br />
          <Button type="primary" onClick={() => { reset(); onClose() }}>Close</Button>
        </div>
      )}
    </Modal>
  )
}
