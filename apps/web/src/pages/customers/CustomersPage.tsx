import { useState, useMemo } from 'react'
import { Table, Button, Modal, Form, Input, InputNumber, Select, Space, Typography, Popconfirm, message, Row, Col, Divider, Checkbox } from 'antd'
import { PlusOutlined, EditOutlined, DeleteOutlined, SearchOutlined } from '@ant-design/icons'
import { useCustomers, useCreateCustomer, useUpdateCustomer, useDeleteCustomer } from '../../api/hooks'
import { DEFAULT_STATE, DEFAULT_PAYMENT_TERMS_DAYS } from '../../utils/constants'

const INDIA_STATES = [
  'Andhra Pradesh','Arunachal Pradesh','Assam','Bihar','Chhattisgarh','Goa','Gujarat',
  'Haryana','Himachal Pradesh','Jharkhand','Karnataka','Kerala','Madhya Pradesh',
  'Maharashtra','Manipur','Meghalaya','Mizoram','Nagaland','Odisha','Punjab','Rajasthan',
  'Sikkim','Tamil Nadu','Telangana','Tripura','Uttar Pradesh','Uttarakhand','West Bengal',
  'Andaman and Nicobar Islands','Chandigarh','Dadra and Nagar Haveli and Daman and Diu',
  'Delhi','Jammu and Kashmir','Ladakh','Lakshadweep','Puducherry',
]

export default function CustomersPage() {
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<any>(null)
  const [search, setSearch] = useState('')
  const [sameAsBilling, setSameAsBilling] = useState(false)
  const [form] = Form.useForm()

  const { data: customers = [], isLoading } = useCustomers()

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return q ? customers.filter((c: any) => c.name?.toLowerCase().includes(q) || c.phone?.toLowerCase().includes(q) || c.gstNumber?.toLowerCase().includes(q)) : customers
  }, [customers, search])
  const { mutateAsync: create } = useCreateCustomer()
  const { mutateAsync: update } = useUpdateCustomer()
  const { mutateAsync: remove } = useDeleteCustomer()

  function openAdd() { setEditing(null); form.resetFields(); setSameAsBilling(false); setOpen(true) }
  function openEdit(r: any) {
    setEditing(r)
    form.setFieldsValue(r)
    setSameAsBilling(!!r.shippingSameAsBilling)
    setOpen(true)
  }

  async function onSave() {
    const values = await form.validateFields()
    try {
      if (editing) { await update({ id: editing.id, ...values }); message.success('Customer updated') }
      else { await create(values); message.success('Customer added') }
      setOpen(false)
    } catch { message.error('Error saving customer') }
  }

  const columns = [
    { title: 'Name', dataIndex: 'name', key: 'name' },
    { title: 'Contact Person', dataIndex: 'contactPerson', key: 'cp' },
    { title: 'Phone', dataIndex: 'phone', key: 'phone' },
    { title: 'Email', dataIndex: 'email', key: 'email', render: (v: string) => v ? <a href={`mailto:${v}`}>{v}</a> : <span style={{ color: '#bbb' }}>-</span> },
    { title: 'GST Number', dataIndex: 'gstNumber', key: 'gst', render: (v: string) => v || '-' },
    { title: 'Bill To', key: 'billing', render: (_: any, r: any) => [r.billingVillage, r.billingDistrict, r.billingState].filter(Boolean).join(', ') || '-' },
    { title: 'Payment Terms', dataIndex: 'paymentTerms', key: 'pt', render: (v: number) => v ? `${v} days` : '-' },
    {
      title: 'Actions', key: 'actions', render: (_: any, r: any) => (
        <Space>
          <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(r)}>Edit</Button>
          <Popconfirm title="Remove this customer?" onConfirm={() => remove(r.id).then(() => message.success('Customer removed'))}>
            <Button size="small" danger icon={<DeleteOutlined />}>Remove</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <div>
      <div className="page-header">
        <div>
          <Typography.Title level={4} className="page-title">Customers</Typography.Title>
          <div className="page-subtitle">Manage buyers and billing details</div>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={openAdd}>Add Customer</Button>
      </div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <Input prefix={<SearchOutlined />} placeholder="Search name, phone, GST…" style={{ width: 300 }} allowClear value={search} onChange={e => setSearch(e.target.value)} />
        <span style={{ alignSelf: 'center', color: '#888', fontSize: 12 }}>{filtered.length} customer{filtered.length !== 1 ? 's' : ''}</span>
      </div>
      <Table dataSource={filtered} columns={columns} rowKey="id" loading={isLoading} size="small" pagination={{ pageSize: 20, showTotal: t => `${t} customers` }} />

      <Modal title={editing ? 'Edit Customer' : 'Add Customer'} open={open} onOk={onSave} onCancel={() => setOpen(false)} width={600}>
        <Form form={form} layout="vertical" size="small">
          <Row gutter={12}>
            <Col span={14}><Form.Item label="Company Name" name="name" rules={[{ required: true }]}><Input /></Form.Item></Col>
            <Col span={10}><Form.Item label="Contact Person" name="contactPerson"><Input /></Form.Item></Col>
          </Row>
          <Row gutter={12}>
            <Col span={12}><Form.Item label="Phone" name="phone"><Input /></Form.Item></Col>
            <Col span={12}><Form.Item label="Email" name="email"><Input /></Form.Item></Col>
          </Row>
          <Row gutter={12}>
            <Col span={12}><Form.Item label="GST Number" name="gstNumber"><Input placeholder="22AAAAA0000A1Z5" /></Form.Item></Col>
            <Col span={12}>
              <Form.Item label="Payment Terms (days)" name="paymentTerms" initialValue={DEFAULT_PAYMENT_TERMS_DAYS}>
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>

          <Divider orientation="left" orientationMargin={0} style={{ margin: '8px 0 4px' }}>Bill To Address</Divider>
          <Row gutter={12}>
            <Col span={8}><Form.Item label="Village" name="billingVillage"><Input /></Form.Item></Col>
            <Col span={8}><Form.Item label="District" name="billingDistrict"><Input /></Form.Item></Col>
            <Col span={8}>
              <Form.Item label="State" name="billingState" initialValue={DEFAULT_STATE}>
                <Select showSearch optionFilterProp="label" options={INDIA_STATES.map(s => ({ value: s, label: s }))} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item label="Street / Door No." name="billingAddress"><Input /></Form.Item>

          <Divider orientation="left" orientationMargin={0} style={{ margin: '8px 0 4px' }}>Ship To Address</Divider>
          <Form.Item name="shippingSameAsBilling" valuePropName="checked" style={{ marginBottom: 8 }}>
            <Checkbox onChange={e => {
              setSameAsBilling(e.target.checked)
              if (e.target.checked) {
                const v = form.getFieldsValue(['billingVillage', 'billingDistrict', 'billingState', 'billingAddress'])
                form.setFieldsValue({ shippingVillage: v.billingVillage, shippingDistrict: v.billingDistrict, shippingState: v.billingState, shippingAddress: v.billingAddress })
              }
            }}>Same as Bill To</Checkbox>
          </Form.Item>
          {!sameAsBilling && (
            <>
              <Row gutter={12}>
                <Col span={8}><Form.Item label="Village" name="shippingVillage"><Input /></Form.Item></Col>
                <Col span={8}><Form.Item label="District" name="shippingDistrict"><Input /></Form.Item></Col>
                <Col span={8}>
                  <Form.Item label="State" name="shippingState" initialValue={DEFAULT_STATE}>
                    <Select showSearch optionFilterProp="label" options={INDIA_STATES.map(s => ({ value: s, label: s }))} />
                  </Form.Item>
                </Col>
              </Row>
              <Form.Item label="Street / Door No." name="shippingAddress"><Input /></Form.Item>
            </>
          )}
        </Form>
      </Modal>
    </div>
  )
}
