import { useState, useRef } from 'react'
import {
  Modal, Button, Upload, Table, Form, Select, InputNumber, Input,
  Alert, Steps, Space, Typography, Tag, Tooltip, message, Spin, Row, Col, Divider
} from 'antd'
import { UploadOutlined, InboxOutlined, CheckCircleOutlined, WarningOutlined } from '@ant-design/icons'
import type { UploadFile } from 'antd'
import api from '../../api/client'
import { useCreateDelivery, useSuppliers, usePurchaseOrders, useSalesOrders, useCustomers } from '../../api/hooks'
import dayjs from 'dayjs'
import customParseFormat from 'dayjs/plugin/customParseFormat'
dayjs.extend(customParseFormat)

const { Text } = Typography

// Parse date strings like "02-May-26" or "02-May-2026"
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
  grossWeight: number  // in quintals
  tareWeight: number
  netWeight: number
  // filled by user
  supplierId?: string
  purchaseOrderId?: string
  customerId?: string
  salesOrderId?: string
  purchaseRate?: number
  saleRate?: number
  moisturePct?: number
  qualityDeductionPct?: number
  status: 'pending' | 'ready' | 'saved' | 'error'
  error?: string
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
  const fileRef = useRef<File | null>(null)

  const { data: suppliers = [] } = useSuppliers()
  const { data: pos = [] } = usePurchaseOrders()
  const { data: sos = [] } = useSalesOrders()
  const { data: customers = [] } = useCustomers()
  const { mutateAsync: createDelivery } = useCreateDelivery()

  function reset() {
    setStep(0); setRows([]); globalForm.resetFields(); fileRef.current = null
  }

  async function handleUpload(file: File) {
    fileRef.current = file
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
        qualityDeductionPct: 0,
        status: 'pending',
      }))
      if (parsed.length === 0) {
        message.warning('No delivery rows found in the PDF. Please check the file format.')
        setParsing(false)
        return false
      }
      setRows(parsed)
      setStep(1)
    } catch (e: any) {
      message.error(`Failed to parse PDF: ${e?.response?.data?.error || e.message}`)
    }
    setParsing(false)
    return false // prevent antd auto-upload
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
      moisturePct: vals.moisturePct ?? r.moisturePct,
      qualityDeductionPct: vals.qualityDeductionPct ?? r.qualityDeductionPct,
      status: (vals.supplierId || r.supplierId) && (vals.purchaseOrderId || r.purchaseOrderId) && (vals.purchaseRate || r.purchaseRate) ? 'ready' : 'pending',
    })))
  }

  function updateRow(key: string, field: string, value: any) {
    setRows(prev => prev.map(r => {
      if (r.key !== key) return r
      const updated = { ...r, [field]: value }
      const ready = updated.supplierId && updated.purchaseOrderId && updated.purchaseRate
      return { ...updated, status: ready ? 'ready' : 'pending' }
    }))
  }

  async function saveAll() {
    const notReady = rows.filter(r => r.status !== 'ready' && r.status !== 'saved')
    if (notReady.length > 0) {
      message.warning(`${notReady.length} rows are missing required fields (Supplier, PO, Purchase Rate)`)
      return
    }
    setSaving(true)
    let saved = 0, errors = 0
    const updated = [...rows]
    for (let i = 0; i < updated.length; i++) {
      const r = updated[i]
      if (r.status === 'saved') continue
      try {
        await createDelivery({
          deliveryDate: parseDate(r.outDate || r.inDate),
          vehicleNumber: r.vehicleNumber || 'N/A',
          supplierId: r.supplierId,
          purchaseOrderId: r.purchaseOrderId,
          customerId: r.customerId || null,
          salesOrderId: r.salesOrderId || null,
          grossWeight: r.grossWeight,
          tareWeight: r.tareWeight,
          purchaseRate: r.purchaseRate,
          saleRate: r.saleRate || null,
          moisturePct: r.moisturePct || null,
          qualityDeductionPct: r.qualityDeductionPct || 0,
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

  const readyCount = rows.filter(r => r.status === 'ready').length
  const savedCount = rows.filter(r => r.status === 'saved').length
  const errorCount = rows.filter(r => r.status === 'error').length

  const columns = [
    { title: 'Challan No', dataIndex: 'challanNo', width: 120, render: (v: string) => <Text code style={{ fontSize: 11 }}>{v}</Text> },
    { title: 'Date', dataIndex: 'outDate', width: 100, render: (v: string) => <Text style={{ fontSize: 12 }}>{v}</Text> },
    { title: 'Vehicle', dataIndex: 'vehicleNumber', width: 110, render: (v: string) => <Text style={{ fontSize: 12 }}>{v || <span style={{ color: '#aaa' }}>—</span>}</Text> },
    {
      title: 'Net Wt (Kg)', dataIndex: 'netWeightKg', width: 100,
      render: (v: number) => <Text strong>{v?.toLocaleString('en-IN')}</Text>
    },
    {
      title: <span>Supplier <Text type="danger">*</Text></span>, key: 'supplier', width: 180,
      render: (_: any, r: ParsedRow) => (
        <Select
          size="small" placeholder="Select" style={{ width: '100%' }} showSearch optionFilterProp="label"
          value={r.supplierId}
          onChange={v => updateRow(r.key, 'supplierId', v)}
          options={suppliers.map((s: any) => ({ value: s.id, label: s.name }))}
        />
      )
    },
    {
      title: <span>PO <Text type="danger">*</Text></span>, key: 'po', width: 160,
      render: (_: any, r: ParsedRow) => (
        <Select
          size="small" placeholder="Select PO" style={{ width: '100%' }} showSearch optionFilterProp="label"
          value={r.purchaseOrderId}
          onChange={v => updateRow(r.key, 'purchaseOrderId', v)}
          options={pos.filter((p: any) => !r.supplierId || p.supplierId === r.supplierId)
            .map((p: any) => ({ value: p.id, label: p.poNumber }))}
        />
      )
    },
    {
      title: <span>Rate (₹/Qt) <Text type="danger">*</Text></span>, key: 'rate', width: 120,
      render: (_: any, r: ParsedRow) => (
        <InputNumber
          size="small" min={0} step={0.01} placeholder="e.g. 1847"
          value={r.purchaseRate}
          onChange={v => updateRow(r.key, 'purchaseRate', v)}
          style={{ width: '100%' }}
        />
      )
    },
    {
      title: 'Moisture %', key: 'mc', width: 100,
      render: (_: any, r: ParsedRow) => (
        <InputNumber
          size="small" min={0} max={100} step={0.1} placeholder="e.g. 14.5"
          value={r.moisturePct}
          onChange={v => updateRow(r.key, 'moisturePct', v)}
          style={{ width: '100%' }}
        />
      )
    },
    {
      title: 'Status', key: 'status', width: 90,
      render: (_: any, r: ParsedRow) => {
        if (r.status === 'saved') return <Tag color="green" icon={<CheckCircleOutlined />}>Saved</Tag>
        if (r.status === 'error') return <Tooltip title={r.error}><Tag color="red" icon={<WarningOutlined />}>Error</Tag></Tooltip>
        if (r.status === 'ready') return <Tag color="blue">Ready</Tag>
        return <Tag color="orange">Incomplete</Tag>
      }
    },
  ]

  return (
    <Modal
      title="Import Sarvani Weighing Report"
      open={open}
      onCancel={() => { reset(); onClose() }}
      width={1100}
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

      {/* Step 0: Upload */}
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

      {/* Step 1: Review */}
      {step === 1 && (
        <>
          <Alert
            type="info"
            showIcon
            message={`${rows.length} truck loads found in the PDF. Apply common values below, then review each row.`}
            style={{ marginBottom: 16 }}
          />

          {/* Global apply form */}
          <div style={{ background: '#f5f5f5', padding: 16, borderRadius: 8, marginBottom: 16 }}>
            <Text strong style={{ display: 'block', marginBottom: 12 }}>Apply to all rows:</Text>
            <Form form={globalForm} layout="inline" size="small">
              <Form.Item label="Supplier" name="supplierId" style={{ marginBottom: 8 }}>
                <Select placeholder="Select supplier" style={{ width: 180 }} showSearch optionFilterProp="label" allowClear
                  options={suppliers.map((s: any) => ({ value: s.id, label: s.name }))} />
              </Form.Item>
              <Form.Item label="Purchase Order" name="purchaseOrderId" style={{ marginBottom: 8 }}>
                <Select placeholder="Select PO" style={{ width: 160 }} showSearch optionFilterProp="label" allowClear
                  options={pos.map((p: any) => ({ value: p.id, label: p.poNumber }))} />
              </Form.Item>
              <Form.Item label="Rate (₹/Qt)" name="purchaseRate" style={{ marginBottom: 8 }}>
                <InputNumber placeholder="e.g. 1847" min={0} step={0.01} style={{ width: 110 }} />
              </Form.Item>
              <Form.Item label="Sale Rate (₹/Qt)" name="saleRate" style={{ marginBottom: 8 }}>
                <InputNumber placeholder="e.g. 1900" min={0} step={0.01} style={{ width: 110 }} />
              </Form.Item>
              <Form.Item label="Customer" name="customerId" style={{ marginBottom: 8 }}>
                <Select placeholder="Select customer" style={{ width: 160 }} showSearch optionFilterProp="label" allowClear
                  options={customers.map((c: any) => ({ value: c.id, label: c.name }))} />
              </Form.Item>
              <Form.Item label="Sales Order" name="salesOrderId" style={{ marginBottom: 8 }}>
                <Select placeholder="Select SO" style={{ width: 160 }} showSearch optionFilterProp="label" allowClear
                  options={sos.map((s: any) => ({ value: s.id, label: s.soNumber }))} />
              </Form.Item>
              <Form.Item style={{ marginBottom: 8 }}>
                <Button type="primary" size="small" onClick={applyGlobal}>Apply to All</Button>
              </Form.Item>
            </Form>
          </div>

          {/* Status summary */}
          <Space style={{ marginBottom: 12 }}>
            <Tag color="blue">{readyCount} Ready</Tag>
            <Tag color="orange">{rows.filter(r => r.status === 'pending').length} Incomplete</Tag>
            {savedCount > 0 && <Tag color="green">{savedCount} Saved</Tag>}
            {errorCount > 0 && <Tag color="red">{errorCount} Errors</Tag>}
          </Space>

          <Table
            dataSource={rows}
            columns={columns}
            rowKey="key"
            size="small"
            pagination={false}
            scroll={{ x: 1050, y: 400 }}
            rowClassName={(r: ParsedRow) => r.status === 'error' ? 'ant-table-row-error' : ''}
          />

          <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <Button onClick={() => { reset(); onClose() }}>Cancel</Button>
            <Button
              type="primary"
              loading={saving}
              disabled={readyCount === 0}
              onClick={saveAll}
            >
              Import {readyCount} Deliveries
            </Button>
          </div>
        </>
      )}

      {/* Step 2: Done */}
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
