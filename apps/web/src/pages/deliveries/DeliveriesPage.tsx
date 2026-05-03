import { useState, useCallback } from 'react'
import {
  Table, Button, Modal, Form, Input, InputNumber, Select, DatePicker,
  Typography, Tag, Space, Popconfirm, message, Divider, Row, Col,
  Descriptions, Switch, Tooltip
} from 'antd'
import { PlusOutlined, EditOutlined, EyeOutlined, DeleteOutlined, UploadOutlined, SaveOutlined } from '@ant-design/icons'
import ImportWeighingReport from './ImportWeighingReport'
import {
  useDeliveries, useCreateDelivery, useUpdateDelivery, useDeleteDelivery,
  useSuppliers, useCustomers, usePurchaseOrders, useSalesOrders, useDelivery
} from '../../api/hooks'
import { formatINR } from '../../utils/format'
import dayjs from 'dayjs'

const STATUS_COLORS: Record<string, string> = {
  PENDING: 'orange', WEIGHED: 'blue', QUALITY_CHECKED: 'purple', COMPLETED: 'green'
}

const qtToKg = (qt: number | null | undefined) => qt != null ? +(Number(qt) * 100).toFixed(1) : null
const kgToQt = (kg: number | null | undefined) => kg != null ? +(Number(kg) / 100).toFixed(3) : null

// Recalculate derived fields — formulas match the Excel tracking sheet exactly
// Weights stored in quintals; rates in ₹/quintal; Excel uses Kg & ₹/kg but results are identical
// D = GrossAmt = netWeight(Qt) × purchaseRate(₹/Qt)
// F = MCDeduction = IF(MC%>14, (MC%-14)/100 × D, 0)
// E = BalanceCess = IF(cessApplicable=NO, -cessPaid, D×0.01 - cessPaid)
// G = NetPayable = D - E - F
function calcDerived(r: any) {
  const gross = Number(r.grossWeight ?? 0)
  const tare = Number(r.tareWeight ?? 0)
  const qd = Number(r.qualityDeductionPct ?? 0)
  const netWeight = gross - tare
  const adjustedWeight = netWeight * (1 - qd / 100)
  const purchaseValue = r.purchaseRate ? adjustedWeight * Number(r.purchaseRate) : null
  const saleValue = r.saleRate ? adjustedWeight * Number(r.saleRate) : null
  const grossMargin = saleValue != null && purchaseValue != null ? saleValue - purchaseValue : null

  // MC Deduction: only on excess moisture above 14%
  const mc = Number(r.moisturePct ?? 0)
  const mcDeduction = purchaseValue != null && mc > 14
    ? ((mc - 14) / 100) * purchaseValue
    : 0

  // Balance Cess (fully calculated — no manual entry)
  const cessPaid = Number(r.cessPaid ?? 0)
  const balanceCess = purchaseValue != null
    ? (r.cessApplicable ? purchaseValue * 0.01 - cessPaid : -cessPaid)
    : null

  // Net Payable to supplier = GrossAmt - BalanceCess - MCDeduction
  const netPayable = purchaseValue != null && balanceCess != null
    ? purchaseValue - balanceCess - mcDeduction
    : null

  return { netWeight, adjustedWeight, purchaseValue, saleValue, grossMargin, mcDeduction, balanceCess, netPayable }
}

function DeliveryDetail({ id }: { id: string }) {
  const { data: d } = useDelivery(id)
  if (!d) return null
  const calc = calcDerived(d)
  return (
    <Descriptions bordered size="small" column={2}>
      <Descriptions.Item label="Slip No.">{d.lrNumber || '—'}</Descriptions.Item>
      <Descriptions.Item label="System LR No.">{d.deliveryNumber}</Descriptions.Item>
      <Descriptions.Item label="Date">{dayjs(d.deliveryDate).format('DD/MM/YYYY')}</Descriptions.Item>
      <Descriptions.Item label="Vehicle">{d.vehicleNumber}</Descriptions.Item>
      <Descriptions.Item label="Supplier">{d.supplier?.name || '—'}</Descriptions.Item>
      <Descriptions.Item label="Purchase Order">{d.purchaseOrder?.poNumber || '—'}</Descriptions.Item>
      <Descriptions.Item label="Gross Weight">{qtToKg(d.grossWeight)?.toLocaleString('en-IN')} Kg</Descriptions.Item>
      <Descriptions.Item label="Tare Weight">{qtToKg(d.tareWeight)?.toLocaleString('en-IN')} Kg</Descriptions.Item>
      <Descriptions.Item label="Net Weight (A)"><b>{qtToKg(calc.netWeight)?.toLocaleString('en-IN')} Kg</b></Descriptions.Item>
      <Descriptions.Item label="Quality Deduction">{d.qualityDeductionPct ?? 0}%</Descriptions.Item>
      <Descriptions.Item label="Purchase Rate (B)">₹{Number(d.purchaseRate || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}/Qt</Descriptions.Item>
      <Descriptions.Item label="Gross Amt (D = A×B)"><b>{formatINR(calc.purchaseValue)}</b></Descriptions.Item>
      <Descriptions.Item label="MC Content %">{d.moisturePct ? `${d.moisturePct}%` : '—'}</Descriptions.Item>
      <Descriptions.Item label="MC Deduction (F)">
        <span style={{ color: calc.mcDeduction > 0 ? '#cf1322' : undefined }}>
          {calc.mcDeduction > 0 ? formatINR(calc.mcDeduction) : '₹0 (MC ≤ 14%)'}
        </span>
      </Descriptions.Item>
      <Descriptions.Item label="Cess Applicable">{d.cessApplicable ? 'Yes' : 'No'}</Descriptions.Item>
      <Descriptions.Item label="Cess Paid (C)">{formatINR(d.cessPaid ?? 0)}</Descriptions.Item>
      <Descriptions.Item label="Balance Cess (E)" span={2}>
        <span style={{ color: calc.balanceCess != null && calc.balanceCess > 0 ? '#cf1322' : '#389e0d' }}>
          {calc.balanceCess != null ? formatINR(calc.balanceCess) : '—'}
          <span style={{ color: '#888', fontSize: 11, marginLeft: 8 }}>
            {d.cessApplicable ? '(1% of Gross − Cess Paid)' : '(−Cess Paid)'}
          </span>
        </span>
      </Descriptions.Item>
      <Descriptions.Item label="Net Payable (G = D−E−F)" span={2}>
        <b style={{ color: '#1677ff', fontSize: 14 }}>{calc.netPayable != null ? formatINR(calc.netPayable) : '—'}</b>
      </Descriptions.Item>
      {d.saleRate && <Descriptions.Item label="Sale Rate">₹{Number(d.saleRate).toLocaleString('en-IN', { maximumFractionDigits: 2 })}/Qt</Descriptions.Item>}
      {calc.saleValue != null && <Descriptions.Item label="Sale Value">{formatINR(calc.saleValue)}</Descriptions.Item>}
      {calc.grossMargin != null && (
        <Descriptions.Item label="Margin" span={2}>
          <b style={{ color: calc.grossMargin >= 0 ? '#389e0d' : '#cf1322' }}>{formatINR(calc.grossMargin)}</b>
        </Descriptions.Item>
      )}
      {d.notes && <Descriptions.Item label="Notes" span={2}>{d.notes}</Descriptions.Item>}
    </Descriptions>
  )
}

// Plain text inline editor (no number formatting)
function InlineText({ value, onSave, placeholder, bold }: {
  value: string | null | undefined
  onSave: (v: string | null) => void
  placeholder?: string
  bold?: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')

  function start() { setDraft(value ?? ''); setEditing(true) }
  function commit() {
    setEditing(false)
    const v = draft.trim() || null
    if (v !== (value ?? null)) onSave(v)
  }

  if (editing) {
    return (
      <Input
        autoFocus size="small" value={draft}
        placeholder={placeholder}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onPressEnter={commit}
        style={{ width: 90 }}
      />
    )
  }
  return (
    <Tooltip title="Click to edit">
      <span
        onClick={start}
        style={{
          cursor: 'pointer',
          borderBottom: '1px dashed #aaa',
          fontWeight: bold ? 600 : undefined,
          whiteSpace: 'nowrap',
          color: value ? undefined : '#bbb',
        }}
      >
        {value || <span style={{ color: '#bbb' }}>{placeholder ?? '—'}</span>}
      </span>
    </Tooltip>
  )
}

// Number inline editor
function InlineNum({
  value, onSave, min = 0, step = 1, prefix, suffix, style, decimals = 0
}: {
  value: number | null | undefined
  onSave: (v: number | null) => void
  min?: number; step?: number; prefix?: string; suffix?: string
  style?: React.CSSProperties; decimals?: number
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<number | null>(null)

  function start() { setDraft(value ?? null); setEditing(true) }
  function commit() {
    setEditing(false)
    if (draft !== value) onSave(draft)
  }

  if (editing) {
    return (
      <InputNumber
        autoFocus size="small" min={min} step={step}
        value={draft}
        onChange={v => setDraft(v)}
        onBlur={commit}
        onPressEnter={commit}
        style={{ width: 90, ...style }}
      />
    )
  }
  const display = value != null
    ? `${prefix ?? ''}${Number(value).toLocaleString('en-IN', { maximumFractionDigits: decimals })}${suffix ?? ''}`
    : null
  return (
    <Tooltip title="Click to edit">
      <span
        onClick={start}
        style={{ cursor: 'pointer', borderBottom: '1px dashed #aaa', whiteSpace: 'nowrap', ...style }}
      >
        {display ?? <span style={{ color: '#bbb' }}>—</span>}
      </span>
    </Tooltip>
  )
}

export default function DeliveriesPage() {
  const [open, setOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [viewId, setViewId] = useState<string | null>(null)
  const [editing, setEditing] = useState<any>(null)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  // Optimistic local overrides keyed by delivery id
  const [overrides, setOverrides] = useState<Record<string, Partial<any>>>({})
  const [form] = Form.useForm()

  const { data: deliveries = [], isLoading } = useDeliveries()
  const { data: suppliers = [] } = useSuppliers()
  const { data: customers = [] } = useCustomers()
  const { data: pos = [] } = usePurchaseOrders()
  const { data: sos = [] } = useSalesOrders()
  const { mutateAsync: create } = useCreateDelivery()
  const { mutateAsync: update } = useUpdateDelivery()
  const { mutateAsync: remove } = useDeleteDelivery()

  // Merge server row with any pending optimistic overrides
  const row = useCallback((r: any) => ({ ...r, ...(overrides[r.id] ?? {}) }), [overrides])

  function openAdd() { setEditing(null); form.resetFields(); setOpen(true) }
  function openEdit(r: any) {
    const merged = row(r)
    setEditing(merged)
    form.setFieldsValue({
      ...merged,
      deliveryDate: dayjs(merged.deliveryDate),
      grossWeight: qtToKg(merged.grossWeight),
      tareWeight: qtToKg(merged.tareWeight),
      cessApplicable: !!merged.cessApplicable,
    })
    setOpen(true)
  }

  async function onSave() {
    const values = await form.validateFields()
    const payload = {
      ...values,
      deliveryDate: values.deliveryDate.format('YYYY-MM-DD'),
      grossWeight: kgToQt(values.grossWeight),
      tareWeight: kgToQt(values.tareWeight),
    }
    try {
      if (editing) {
        await update({ id: editing.id, ...payload })
        // clear optimistic overrides for this row — server data will refresh
        setOverrides(prev => { const n = { ...prev }; delete n[editing.id]; return n })
        message.success('Delivery updated')
      } else {
        await create(payload)
        message.success('Delivery recorded')
      }
      setOpen(false)
    } catch { message.error('Error saving delivery') }
  }

  // Optimistic patch: update local state immediately, persist in background
  const patch = useCallback((id: string, fields: Record<string, any>) => {
    setOverrides(prev => ({ ...prev, [id]: { ...(prev[id] ?? {}), ...fields } }))
    update({ id, ...fields }).catch(() => {
      message.error('Failed to save')
      // revert on error
      setOverrides(prev => {
        const n = { ...prev }
        const reverted = { ...(n[id] ?? {}) }
        Object.keys(fields).forEach(k => delete reverted[k])
        if (Object.keys(reverted).length === 0) delete n[id]; else n[id] = reverted
        return n
      })
    })
  }, [update])

  async function deleteSelected() {
    let failed = 0
    for (const id of selectedIds) {
      try { await remove(id) } catch { failed++ }
    }
    if (failed === 0) message.success(`${selectedIds.length} deliveries deleted`)
    else message.warning(`${selectedIds.length - failed} deleted, ${failed} failed`)
    setSelectedIds([])
  }

  const columns = [
    {
      title: 'Slip No.', key: 'slip', width: 90, fixed: 'left' as const,
      render: (_: any, raw: any) => {
        const r = row(raw)
        return (
          <InlineText
            value={r.lrNumber}
            onSave={v => patch(r.id, { lrNumber: v })}
            placeholder="—"
            bold
          />
        )
      }
    },
    {
      title: 'Date', dataIndex: 'deliveryDate', key: 'date', width: 100,
      render: (v: string) => dayjs(v).format('DD/MM/YYYY')
    },
    { title: 'Vehicle', dataIndex: 'vehicleNumber', key: 'vehicle', width: 115 },
    { title: 'Supplier', dataIndex: ['supplier', 'name'], key: 'supplier', width: 130 },
    {
      title: 'Net Wt (Kg)', key: 'netWt', width: 105,
      render: (_: any, raw: any) => {
        const r = row(raw)
        const calc = calcDerived(r)
        return <b>{qtToKg(calc.netWeight)?.toLocaleString('en-IN') ?? '—'}</b>
      }
    },
    {
      title: 'Rate (₹/Qt)', key: 'rate', width: 110,
      render: (_: any, raw: any) => {
        const r = row(raw)
        return (
          <InlineNum
            value={r.purchaseRate} step={0.5} decimals={2}
            onSave={v => patch(r.id, { purchaseRate: v })}
            prefix="₹"
          />
        )
      }
    },
    {
      title: 'Purchase Value', key: 'pv', width: 125,
      render: (_: any, raw: any) => {
        const calc = calcDerived(row(raw))
        return formatINR(calc.purchaseValue)
      }
    },
    {
      title: 'MC %', key: 'mc', width: 80,
      render: (_: any, raw: any) => {
        const r = row(raw)
        return (
          <InlineNum
            value={r.moisturePct} step={0.1} decimals={1}
            onSave={v => patch(r.id, { moisturePct: v })}
            suffix="%"
          />
        )
      }
    },
    {
      title: 'MC Ded.', key: 'mcDed', width: 100,
      render: (_: any, raw: any) => {
        const calc = calcDerived(row(raw))
        return calc.mcDeduction != null
          ? <span style={{ color: '#cf1322' }}>{formatINR(calc.mcDeduction)}</span>
          : <span style={{ color: '#ccc' }}>—</span>
      }
    },
    {
      title: 'Cess?', key: 'cess', width: 65,
      render: (_: any, raw: any) => {
        const r = row(raw)
        return (
          <Switch
            size="small"
            checked={!!r.cessApplicable}
            checkedChildren="Y" unCheckedChildren="N"
            onChange={v => patch(r.id, { cessApplicable: v })}
          />
        )
      }
    },
    {
      title: 'Cess Paid', key: 'cessPaid', width: 100,
      render: (_: any, raw: any) => {
        const r = row(raw)
        return r.cessApplicable ? (
          <InlineNum
            value={r.cessPaid}
            onSave={v => patch(r.id, { cessPaid: v })}
            prefix="₹"
          />
        ) : <span style={{ color: '#ccc' }}>N/A</span>
      }
    },
    {
      title: 'Bal. Cess (E)', key: 'balCess', width: 110,
      render: (_: any, raw: any) => {
        const calc = calcDerived(row(raw))
        if (calc.balanceCess == null) return <span style={{ color: '#ccc' }}>—</span>
        return (
          <span style={{ color: calc.balanceCess > 0 ? '#cf1322' : '#389e0d' }}>
            {formatINR(calc.balanceCess)}
          </span>
        )
      }
    },
    {
      title: 'Net Payable', key: 'netPay', width: 115,
      render: (_: any, raw: any) => {
        const calc = calcDerived(row(raw))
        return calc.netPayable != null
          ? <b style={{ color: '#1677ff' }}>{formatINR(calc.netPayable)}</b>
          : <span style={{ color: '#ccc' }}>—</span>
      }
    },
    {
      title: 'Sale Value', key: 'sv', width: 115,
      render: (_: any, raw: any) => {
        const calc = calcDerived(row(raw))
        return calc.saleValue != null ? formatINR(calc.saleValue) : '—'
      }
    },
    {
      title: 'Margin', key: 'margin', width: 110,
      render: (_: any, raw: any) => {
        const calc = calcDerived(row(raw))
        if (calc.grossMargin == null) return <span style={{ color: '#ccc' }}>—</span>
        return (
          <b style={{ color: calc.grossMargin >= 0 ? '#389e0d' : '#cf1322' }}>
            {formatINR(calc.grossMargin)}
          </b>
        )
      }
    },
    {
      title: 'Status', dataIndex: 'status', key: 'status', width: 110,
      render: (v: string) => <Tag color={STATUS_COLORS[v]}>{v}</Tag>
    },
    {
      title: 'Actions', key: 'actions', width: 120, fixed: 'right' as const,
      render: (_: any, r: any) => (
        <Space size={4}>
          <Button size="small" icon={<EyeOutlined />} onClick={() => setViewId(r.id)} />
          <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(r)} />
          <Popconfirm
            title="Delete this delivery?"
            onConfirm={() => remove(r.id).then(() => message.success('Deleted')).catch((e: any) => message.error(e?.response?.data?.error || 'Cannot delete'))}
          >
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <Typography.Title level={4} style={{ margin: 0 }}>Deliveries (Lorry Receipts)</Typography.Title>
        <Space>
          {selectedIds.length > 0 && (
            <Popconfirm
              title={`Delete ${selectedIds.length} selected deliveries?`}
              onConfirm={deleteSelected}
              okText="Delete" okButtonProps={{ danger: true }}
            >
              <Button danger icon={<DeleteOutlined />}>Delete {selectedIds.length} Selected</Button>
            </Popconfirm>
          )}
          <Button icon={<UploadOutlined />} onClick={() => setImportOpen(true)}>Import Weighing Report</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={openAdd}>Record Delivery</Button>
        </Space>
      </div>

      {selectedIds.length > 0 && (
        <div style={{ marginBottom: 8, color: '#888', fontSize: 13 }}>
          {selectedIds.length} row{selectedIds.length > 1 ? 's' : ''} selected —{' '}
          <a onClick={() => setSelectedIds([])}>clear</a>
        </div>
      )}

      <Table
        dataSource={[...deliveries].sort((a: any, b: any) => {
          const an = parseInt(a.lrNumber ?? '0', 10) || 0
          const bn = parseInt(b.lrNumber ?? '0', 10) || 0
          if (an !== bn) return an - bn
          // fallback: system LR number ascending
          return (a.deliveryNumber ?? '').localeCompare(b.deliveryNumber ?? '')
        })}
        columns={columns}
        rowKey="id"
        loading={isLoading}
        size="small"
        scroll={{ x: 1600 }}
        rowSelection={{
          selectedRowKeys: selectedIds,
          onChange: keys => setSelectedIds(keys as string[]),
        }}
        pagination={{ pageSize: 50, showSizeChanger: true }}
      />

      {/* View Modal */}
      <Modal title="Delivery Details" open={!!viewId} onCancel={() => setViewId(null)} footer={null} width={720}>
        {viewId && <DeliveryDetail id={viewId} />}
      </Modal>

      {/* Import Modal */}
      <ImportWeighingReport
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onDone={() => setImportOpen(false)}
      />

      {/* Add/Edit Modal */}
      <Modal
        title={editing ? 'Edit Delivery' : 'Record Delivery'}
        open={open} onOk={onSave} onCancel={() => setOpen(false)}
        width={760} okText={editing ? 'Save Changes' : 'Record'}
        okButtonProps={{ icon: <SaveOutlined /> }}
      >
        <Form form={form} layout="vertical" size="small">
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item label="Delivery Date" name="deliveryDate" rules={[{ required: true }]}>
                <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item label="Vehicle Number" name="vehicleNumber" rules={[{ required: true }]}>
                <Input placeholder="e.g. AP07TF6826" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item label="Slip No." name="lrNumber">
                <Input placeholder="Challan / Slip number" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item label="Supplier" name="supplierId">
                <Select showSearch optionFilterProp="label" allowClear
                  options={suppliers.map((s: any) => ({ value: s.id, label: s.name }))} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="Purchase Order" name="purchaseOrderId">
                <Select showSearch optionFilterProp="label" allowClear
                  options={pos.map((p: any) => ({ value: p.id, label: `${p.poNumber} — ${p.supplier?.name ?? ''}` }))} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item label="Customer (Buyer)" name="customerId">
                <Select showSearch optionFilterProp="label" allowClear
                  options={customers.map((c: any) => ({ value: c.id, label: c.name }))} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="Sales Order" name="salesOrderId">
                <Select showSearch optionFilterProp="label" allowClear
                  options={sos.map((s: any) => ({ value: s.id, label: `${s.soNumber} — ${s.customer?.name ?? ''}` }))} />
              </Form.Item>
            </Col>
          </Row>

          <Divider orientation="left" orientationMargin={0}>Weight (Kg)</Divider>
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item label="Gross Weight (Kg)" name="grossWeight" rules={[{ required: true }]}>
                <InputNumber min={0} style={{ width: '100%' }} step={10} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item label="Tare Weight (Kg)" name="tareWeight" rules={[{ required: true }]}>
                <InputNumber min={0} style={{ width: '100%' }} step={10} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item label="Quality Deduction (%)" name="qualityDeductionPct" initialValue={0}>
                <InputNumber min={0} max={100} style={{ width: '100%' }} step={0.01} />
              </Form.Item>
            </Col>
          </Row>

          <Divider orientation="left" orientationMargin={0}>Rates</Divider>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item label="Purchase Rate (₹/Qt)" name="purchaseRate">
                <InputNumber min={0} style={{ width: '100%' }} step={0.5} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="Sale Rate (₹/Qt)" name="saleRate">
                <InputNumber min={0} style={{ width: '100%' }} step={0.5} />
              </Form.Item>
            </Col>
          </Row>

          <Divider orientation="left" orientationMargin={0}>Quality & Cess</Divider>
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item label="MC Content (%)" name="moisturePct">
                <InputNumber min={0} max={100} style={{ width: '100%' }} step={0.1} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item label="Foreign Matter (%)" name="foreignMatterPct">
                <InputNumber min={0} max={100} style={{ width: '100%' }} step={0.1} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item label="Cess Applicable" name="cessApplicable" valuePropName="checked" initialValue={false}>
                <Switch checkedChildren="Yes" unCheckedChildren="No" />
              </Form.Item>
            </Col>
            <Col span={16}>
              <Form.Item
                label="Cess Paid (₹)"
                name="cessPaid"
                extra="Balance Cess is auto-calculated: if Cess=YES → 1% of Gross − Cess Paid; if NO → −Cess Paid"
              >
                <InputNumber min={0} style={{ width: '100%' }} step={1} />
              </Form.Item>
            </Col>
          </Row>

          <Divider orientation="left" orientationMargin={0}>Transporter</Divider>
          <Row gutter={16}>
            <Col span={12}><Form.Item label="Driver Name" name="driverName"><Input /></Form.Item></Col>
            <Col span={12}><Form.Item label="Driver Phone" name="driverPhone"><Input /></Form.Item></Col>
          </Row>
          <Form.Item label="Notes" name="notes"><Input.TextArea rows={2} /></Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
