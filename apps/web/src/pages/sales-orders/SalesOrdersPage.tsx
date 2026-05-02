import { useState } from 'react'
import { Table, Button, Modal, Form, Input, InputNumber, Select, DatePicker, Typography, Tag, message } from 'antd'
import { PlusOutlined, EditOutlined } from '@ant-design/icons'
import { useSalesOrders, useCreateSalesOrder, useUpdateSalesOrder, useCustomers, useCommodities } from '../../api/hooks'
import { formatINR, formatQt } from '../../utils/format'
import dayjs from 'dayjs'

const STATUS_COLORS: Record<string, string> = { DRAFT: 'default', CONFIRMED: 'blue', IN_PROGRESS: 'orange', COMPLETED: 'green', CANCELLED: 'red' }

export default function SalesOrdersPage() {
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<any>(null)
  const [form] = Form.useForm()

  const { data: orders = [], isLoading } = useSalesOrders()
  const { data: customers = [] } = useCustomers()
  const { data: commodities = [] } = useCommodities()
  const { mutateAsync: create } = useCreateSalesOrder()
  const { mutateAsync: update } = useUpdateSalesOrder()

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

  const columns = [
    { title: 'SO Number', dataIndex: 'soNumber', key: 'soNumber', render: (v: string) => <b>{v}</b> },
    { title: 'Date', dataIndex: 'orderDate', key: 'date', render: (v: string) => dayjs(v).format('DD MMM YYYY') },
    { title: 'Customer', dataIndex: ['customer', 'name'], key: 'customer' },
    { title: 'Commodity', dataIndex: ['commodity', 'name'], key: 'commodity' },
    { title: 'Qty (Qt)', dataIndex: 'quantityOrdered', key: 'qty', render: formatQt },
    { title: 'Rate (₹/Qt)', dataIndex: 'ratePerQuintal', key: 'rate', render: (v: number) => `₹${Number(v).toLocaleString('en-IN')}` },
    { title: 'Total Value', key: 'total', render: (_: any, r: any) => formatINR(Number(r.quantityOrdered) * Number(r.ratePerQuintal)) },
    { title: 'Status', dataIndex: 'status', key: 'status', render: (v: string) => <Tag color={STATUS_COLORS[v]}>{v}</Tag> },
    { title: 'Actions', key: 'actions', render: (_: any, r: any) => <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(r)}>Edit</Button> },
  ]

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <Typography.Title level={4} style={{ margin: 0 }}>Sales Orders</Typography.Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={openAdd}>New Sales Order</Button>
      </div>
      <Table dataSource={orders} columns={columns} rowKey="id" loading={isLoading} />
      <Modal title={editing ? 'Edit Sales Order' : 'New Sales Order'} open={open} onOk={onSave} onCancel={() => setOpen(false)} width={600}>
        <Form form={form} layout="vertical">
          <Form.Item label="Customer (Buyer)" name="customerId" rules={[{ required: true }]}>
            <Select showSearch optionFilterProp="label" options={customers.map((c: any) => ({ value: c.id, label: c.name }))} />
          </Form.Item>
          <Form.Item label="Commodity" name="commodityId" rules={[{ required: true }]}>
            <Select options={commodities.map((c: any) => ({ value: c.id, label: c.name }))} />
          </Form.Item>
          <Form.Item label="Order Date" name="orderDate" rules={[{ required: true }]}>
            <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
          </Form.Item>
          <Form.Item label="Quantity (Quintals)" name="quantityOrdered" rules={[{ required: true }]}>
            <InputNumber min={0} style={{ width: '100%' }} step={0.001} />
          </Form.Item>
          <Form.Item label="Rate per Quintal (₹)" name="ratePerQuintal" rules={[{ required: true }]}>
            <InputNumber min={0} style={{ width: '100%' }} step={0.01} />
          </Form.Item>
          <Form.Item label="Notes" name="notes"><Input.TextArea rows={2} /></Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
