import { useState } from 'react'
import { Table, Button, Modal, Form, Input, InputNumber, Select, DatePicker, Typography, Tag, Space, Popconfirm, message, Divider, Row, Col, Descriptions } from 'antd'
import { PlusOutlined, EditOutlined, EyeOutlined, DeleteOutlined, UploadOutlined } from '@ant-design/icons'
import ImportWeighingReport from './ImportWeighingReport'
import {
  useDeliveries, useCreateDelivery, useUpdateDelivery, useDeleteDelivery,
  useSuppliers, useCustomers, usePurchaseOrders, useSalesOrders, useDelivery
} from '../../api/hooks'
import { formatINR, formatQt } from '../../utils/format'
import dayjs from 'dayjs'

const STATUS_COLORS: Record<string, string> = { PENDING: 'orange', WEIGHED: 'blue', QUALITY_CHECKED: 'purple', COMPLETED: 'green' }

function DeliveryDetail({ id }: { id: string }) {
  const { data: d } = useDelivery(id)
  if (!d) return null
  return (
    <Descriptions bordered size="small" column={2}>
      <Descriptions.Item label="LR Number">{d.deliveryNumber}</Descriptions.Item>
      <Descriptions.Item label="Date">{dayjs(d.deliveryDate).format('DD MMM YYYY')}</Descriptions.Item>
      <Descriptions.Item label="Supplier">{d.supplier?.name}</Descriptions.Item>
      <Descriptions.Item label="Vehicle">{d.vehicleNumber}</Descriptions.Item>
      <Descriptions.Item label="Gross Weight">{formatQt(d.grossWeight)}</Descriptions.Item>
      <Descriptions.Item label="Tare Weight">{formatQt(d.tareWeight)}</Descriptions.Item>
      <Descriptions.Item label="Net Weight">{formatQt(d.netWeight)}</Descriptions.Item>
      <Descriptions.Item label="Quality Deduction">{d.qualityDeductionPct}%</Descriptions.Item>
      <Descriptions.Item label="Adjusted Weight" span={2}><b>{formatQt(d.adjustedWeight)}</b></Descriptions.Item>
      <Descriptions.Item label="Purchase Rate">₹{Number(d.purchaseRate).toLocaleString('en-IN')}/Qt</Descriptions.Item>
      <Descriptions.Item label="Purchase Value"><b>{formatINR(d.purchaseValue)}</b></Descriptions.Item>
      {d.saleRate && <Descriptions.Item label="Sale Rate">₹{Number(d.saleRate).toLocaleString('en-IN')}/Qt</Descriptions.Item>}
      {d.saleValue && <Descriptions.Item label="Sale Value"><b>{formatINR(d.saleValue)}</b></Descriptions.Item>}
      {d.grossMargin != null && <Descriptions.Item label="Gross Margin" span={2}><b style={{ color: Number(d.grossMargin) >= 0 ? '#2e7d32' : '#cf1322' }}>{formatINR(d.grossMargin)}</b></Descriptions.Item>}
      {d.lrNumber && <Descriptions.Item label="Transporter LR No.">{d.lrNumber}</Descriptions.Item>}
      {d.moisturePct && <Descriptions.Item label="Moisture %">{d.moisturePct}%</Descriptions.Item>}
    </Descriptions>
  )
}

export default function DeliveriesPage() {
  const [open, setOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [viewId, setViewId] = useState<string | null>(null)
  const [editing, setEditing] = useState<any>(null)
  const [form] = Form.useForm()

  const { data: deliveries = [], isLoading } = useDeliveries()
  const { data: suppliers = [] } = useSuppliers()
  const { data: customers = [] } = useCustomers()
  const { data: pos = [] } = usePurchaseOrders()
  const { data: sos = [] } = useSalesOrders()
  const { mutateAsync: create } = useCreateDelivery()
  const { mutateAsync: update } = useUpdateDelivery()
  const { mutateAsync: remove } = useDeleteDelivery()

  function openAdd() { setEditing(null); form.resetFields(); setOpen(true) }
  function openEdit(r: any) {
    setEditing(r)
    form.setFieldsValue({ ...r, deliveryDate: dayjs(r.deliveryDate) })
    setOpen(true)
  }

  async function onSave() {
    const values = await form.validateFields()
    const payload = { ...values, deliveryDate: values.deliveryDate.format('YYYY-MM-DD') }
    try {
      if (editing) { await update({ id: editing.id, ...payload }); message.success('Delivery updated') }
      else { await create(payload); message.success('Delivery recorded') }
      setOpen(false)
    } catch { message.error('Error saving delivery') }
  }

  const columns = [
    { title: 'LR No.', dataIndex: 'deliveryNumber', key: 'lr', render: (v: string) => <b>{v}</b> },
    { title: 'Date', dataIndex: 'deliveryDate', key: 'date', render: (v: string) => dayjs(v).format('DD MMM YYYY') },
    { title: 'Supplier', dataIndex: ['supplier', 'name'], key: 'supplier' },
    { title: 'Vehicle', dataIndex: 'vehicleNumber', key: 'vehicle' },
    { title: 'Adj. Weight', dataIndex: 'adjustedWeight', key: 'weight', render: formatQt },
    { title: 'Purchase Value', dataIndex: 'purchaseValue', key: 'pv', render: (v: number) => formatINR(v) },
    { title: 'Sale Value', dataIndex: 'saleValue', key: 'sv', render: (v: number) => v ? formatINR(v) : '—' },
    { title: 'Margin', dataIndex: 'grossMargin', key: 'margin', render: (v: number) => v != null ? <span style={{ color: v >= 0 ? '#2e7d32' : '#cf1322' }}>{formatINR(v)}</span> : '—' },
    { title: 'Status', dataIndex: 'status', key: 'status', render: (v: string) => <Tag color={STATUS_COLORS[v]}>{v}</Tag> },
    {
      title: 'Actions', key: 'actions', render: (_: any, r: any) => (
        <Space>
          <Button size="small" icon={<EyeOutlined />} onClick={() => setViewId(r.id)}>View</Button>
          <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(r)}>Edit</Button>
          <Popconfirm title="Delete this delivery?" onConfirm={() => remove(r.id).then(() => message.success('Deleted')).catch((e: any) => message.error(e?.response?.data?.error || 'Cannot delete'))}>
            <Button size="small" danger icon={<DeleteOutlined />}>Delete</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <Typography.Title level={4} style={{ margin: 0 }}>Deliveries (Lorry Receipts)</Typography.Title>
        <Space>
          <Button icon={<UploadOutlined />} onClick={() => setImportOpen(true)}>Import Weighing Report</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={openAdd}>Record Delivery</Button>
        </Space>
      </div>
      <Table dataSource={deliveries} columns={columns} rowKey="id" loading={isLoading} scroll={{ x: 1000 }} />

      {/* View Modal */}
      <Modal title="Delivery Details" open={!!viewId} onCancel={() => setViewId(null)} footer={null} width={700}>
        {viewId && <DeliveryDetail id={viewId} />}
      </Modal>

      {/* Import Modal */}
      <ImportWeighingReport
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onDone={() => { setImportOpen(false) }}
      />

      {/* Add/Edit Modal */}
      <Modal title={editing ? 'Edit Delivery' : 'Record Delivery'} open={open} onOk={onSave} onCancel={() => setOpen(false)} width={700}>
        <Form form={form} layout="vertical">
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item label="Delivery Date" name="deliveryDate" rules={[{ required: true }]}>
                <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="Vehicle Number" name="vehicleNumber" rules={[{ required: true }]}>
                <Input placeholder="e.g. MH 12 AB 1234" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item label="Supplier" name="supplierId" rules={[{ required: true }]}>
                <Select showSearch optionFilterProp="label" options={suppliers.map((s: any) => ({ value: s.id, label: s.name }))} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="Purchase Order" name="purchaseOrderId" rules={[{ required: true }]}>
                <Select showSearch optionFilterProp="label" options={pos.map((p: any) => ({ value: p.id, label: `${p.poNumber} — ${p.supplier?.name}` }))} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item label="Customer (Buyer)" name="customerId">
                <Select showSearch optionFilterProp="label" options={customers.map((c: any) => ({ value: c.id, label: c.name }))} allowClear />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="Sales Order" name="salesOrderId">
                <Select showSearch optionFilterProp="label" options={sos.map((s: any) => ({ value: s.id, label: `${s.soNumber} — ${s.customer?.name}` }))} allowClear />
              </Form.Item>
            </Col>
          </Row>
          <Divider orientation="left" orientationMargin={0}>Weight (in Quintals)</Divider>
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item label="Gross Weight (Qt)" name="grossWeight" rules={[{ required: true }]}>
                <InputNumber min={0} style={{ width: '100%' }} step={0.001} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item label="Tare Weight (Qt)" name="tareWeight" rules={[{ required: true }]}>
                <InputNumber min={0} style={{ width: '100%' }} step={0.001} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item label="Quality Deduction (%)" name="qualityDeductionPct" initialValue={0}>
                <InputNumber min={0} max={100} style={{ width: '100%' }} step={0.01} />
              </Form.Item>
            </Col>
          </Row>
          <Divider orientation="left" orientationMargin={0}>Quality</Divider>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item label="Moisture (%)" name="moisturePct">
                <InputNumber min={0} max={100} style={{ width: '100%' }} step={0.1} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="Foreign Matter (%)" name="foreignMatterPct">
                <InputNumber min={0} max={100} style={{ width: '100%' }} step={0.1} />
              </Form.Item>
            </Col>
          </Row>
          <Divider orientation="left" orientationMargin={0}>Rates</Divider>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item label="Purchase Rate (₹/Qt)" name="purchaseRate" rules={[{ required: true }]}>
                <InputNumber min={0} style={{ width: '100%' }} step={0.01} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="Sale Rate (₹/Qt)" name="saleRate">
                <InputNumber min={0} style={{ width: '100%' }} step={0.01} />
              </Form.Item>
            </Col>
          </Row>
          <Divider orientation="left" orientationMargin={0}>Transporter Details</Divider>
          <Row gutter={16}>
            <Col span={8}><Form.Item label="Driver Name" name="driverName"><Input /></Form.Item></Col>
            <Col span={8}><Form.Item label="Driver Phone" name="driverPhone"><Input /></Form.Item></Col>
            <Col span={8}><Form.Item label="LR Number (Transporter)" name="lrNumber"><Input /></Form.Item></Col>
          </Row>
          <Form.Item label="Notes" name="notes"><Input.TextArea rows={2} /></Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
