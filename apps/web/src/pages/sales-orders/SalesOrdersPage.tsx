import { useState, useMemo } from 'react'
import { Table, Button, Modal, Form, Input, InputNumber, Select, DatePicker, Space, Typography, Tooltip, Popconfirm, message, Row, Col } from 'antd'
import { PlusOutlined, EditOutlined, DeleteOutlined, SearchOutlined } from '@ant-design/icons'
import { useSalesOrders, useCreateSalesOrder, useUpdateSalesOrder, useDeleteSalesOrder, useCustomers, useCommodities } from '../../api/hooks'
import { formatINR } from '../../utils/format'
import dayjs from 'dayjs'

function InlineNum({ value, onSave, min = 0, step = 1, prefix, decimals = 0 }: {
  value: number | null | undefined; onSave: (v: number) => void
  min?: number; step?: number; prefix?: string; decimals?: number
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<number | null>(null)
  function start() { setDraft(value ?? null); setEditing(true) }
  function commit() { setEditing(false); if (draft != null && draft !== value) onSave(draft) }
  if (editing) {
    return <InputNumber autoFocus size="small" min={min} step={step} value={draft}
      onChange={v => setDraft(v)} onBlur={commit} onPressEnter={commit} style={{ width: 90 }} />
  }
  const display = value != null ? `${prefix ?? ''}${Number(value).toLocaleString('en-IN', { maximumFractionDigits: decimals })}` : '—'
  return (
    <Tooltip title="Click to edit">
      <span onClick={start} style={{ cursor: 'pointer', borderBottom: '1px dashed #aaa', whiteSpace: 'nowrap' }}>{display}</span>
    </Tooltip>
  )
}

export default function SalesOrdersPage() {
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<any>(null)
  const [search, setSearch] = useState('')
  const [filterCustomer, setFilterCustomer] = useState<string>('')
  const [form] = Form.useForm()

  const { data: orders = [], isLoading } = useSalesOrders()
  const { data: customers = [] } = useCustomers()
  const { data: commodities = [] } = useCommodities()
  const { mutateAsync: create } = useCreateSalesOrder()
  const { mutateAsync: update } = useUpdateSalesOrder()
  const { mutateAsync: remove } = useDeleteSalesOrder()

  const filtered = useMemo(() => orders.filter((o: any) => {
    if (filterCustomer && o.customerId !== filterCustomer) return false
    if (search && !o.soNumber?.toLowerCase().includes(search.toLowerCase()) && !o.customer?.name?.toLowerCase().includes(search.toLowerCase())) return false
    return true
  }), [orders, filterCustomer, search])

  function openAdd() { setEditing(null); form.resetFields(); setOpen(true) }
  function openEdit(r: any) { setEditing(r); form.setFieldsValue({ ...r, orderDate: dayjs(r.orderDate) }); setOpen(true) }

  async function onSave() {
    const values = await form.validateFields()
    const payload = { ...values, orderDate: values.orderDate.format('YYYY-MM-DD') }
    try {
      if (editing) { await update({ id: editing.id, ...payload }); message.success('SO updated') }
      else { await create(payload); message.success('Sales Order created') }
      setOpen(false)
    } catch { message.error('Error saving') }
  }

  function patch(id: string, fields: Record<string, any>) {
    update({ id, ...fields }).catch(() => message.error('Failed to save'))
  }

  const columns = [
    { title: 'SO Number', dataIndex: 'soNumber', key: 'soNumber', render: (v: string) => <b>{v}</b> },
    { title: 'Date', dataIndex: 'orderDate', key: 'date', render: (v: string) => dayjs(v).format('DD/MM/YYYY') },
    { title: 'Customer', dataIndex: ['customer', 'name'], key: 'customer' },
    { title: 'Commodity', dataIndex: ['commodity', 'name'], key: 'commodity' },
    {
      title: 'Qty (Qt)', key: 'qty', width: 110,
      render: (_: any, r: any) => (
        <InlineNum value={Number(r.quantityOrdered)} step={0.001} decimals={3}
          onSave={v => patch(r.id, { quantityOrdered: v })} />
      ),
    },
    {
      title: 'Rate (₹/Qt)', key: 'rate', width: 120,
      render: (_: any, r: any) => (
        <InlineNum value={Number(r.ratePerQuintal)} step={0.5} decimals={2} prefix="₹"
          onSave={v => patch(r.id, { ratePerQuintal: v })} />
      ),
    },
    { title: 'Total Value', key: 'total', render: (_: any, r: any) => formatINR(Number(r.quantityOrdered) * Number(r.ratePerQuintal)) },
    {
      title: 'Actions', key: 'actions', render: (_: any, r: any) => (
        <Space>
          <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(r)}>Edit</Button>
          <Popconfirm title="Delete this sales order?" onConfirm={() => remove(r.id).then(() => message.success('SO deleted')).catch((e: any) => message.error(e?.response?.data?.error || 'Cannot delete'))}>
            <Button size="small" danger icon={<DeleteOutlined />}>Delete</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
        <Typography.Title level={4} style={{ margin: 0 }}>Sales Orders</Typography.Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={openAdd}>New Sales Order</Button>
      </div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <Input prefix={<SearchOutlined />} placeholder="Search SO number or customer…" style={{ width: 260 }} allowClear value={search} onChange={e => setSearch(e.target.value)} />
        <Select placeholder="Filter by Customer" style={{ width: 200 }} allowClear showSearch optionFilterProp="label"
          options={customers.map((c: any) => ({ value: c.id, label: c.name }))}
          onChange={v => setFilterCustomer(v || '')} />
        <span style={{ alignSelf: 'center', color: '#888', fontSize: 12 }}>{filtered.length} order{filtered.length !== 1 ? 's' : ''}</span>
      </div>
      <Table dataSource={filtered} columns={columns} rowKey="id" loading={isLoading} size="small" />

      <Modal title={editing ? 'Edit Sales Order' : 'New Sales Order'} open={open} onOk={onSave} onCancel={() => setOpen(false)} width={480}>
        <Form form={form} layout="vertical" size="small">
          <Row gutter={12}>
            <Col span={14}>
              <Form.Item label="Customer (Buyer)" name="customerId" rules={[{ required: true }]}>
                <Select showSearch optionFilterProp="label" options={customers.map((c: any) => ({ value: c.id, label: c.name }))} />
              </Form.Item>
            </Col>
            <Col span={10}>
              <Form.Item label="Commodity" name="commodityId" rules={[{ required: true }]}>
                <Select options={commodities.map((c: any) => ({ value: c.id, label: c.name }))} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col span={10}>
              <Form.Item label="Order Date" name="orderDate" rules={[{ required: true }]}>
                <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
              </Form.Item>
            </Col>
            <Col span={7}>
              <Form.Item label="Quantity (Qt)" name="quantityOrdered" rules={[{ required: true }]}>
                <InputNumber min={0} style={{ width: '100%' }} step={0.001} />
              </Form.Item>
            </Col>
            <Col span={7}>
              <Form.Item label="Rate (₹/Qt)" name="ratePerQuintal" rules={[{ required: true }]}>
                <InputNumber min={0} style={{ width: '100%' }} step={0.01} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item label="Notes" name="notes"><Input.TextArea rows={2} /></Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
