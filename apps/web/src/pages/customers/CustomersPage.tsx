import { useState, useMemo } from 'react'
import { Table, Button, Modal, Form, Input, InputNumber, Select, Space, Typography, Popconfirm, message, Row, Col } from 'antd'
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
  const [form] = Form.useForm()

  const { data: customers = [], isLoading } = useCustomers()

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return q ? customers.filter((c: any) => c.name?.toLowerCase().includes(q) || c.phone?.toLowerCase().includes(q) || c.gstNumber?.toLowerCase().includes(q)) : customers
  }, [customers, search])
  const { mutateAsync: create } = useCreateCustomer()
  const { mutateAsync: update } = useUpdateCustomer()
  const { mutateAsync: remove } = useDeleteCustomer()

  function openAdd() { setEditing(null); form.resetFields(); setOpen(true) }
  function openEdit(r: any) { setEditing(r); form.setFieldsValue(r); setOpen(true) }

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
    { title: 'GST Number', dataIndex: 'gstNumber', key: 'gst', render: (v: string) => v || '—' },
    { title: 'Payment Terms', dataIndex: 'paymentTerms', key: 'pt', render: (v: number) => v ? `${v} days` : '—' },
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
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
        <Typography.Title level={4} style={{ margin: 0 }}>Customers (Buyers)</Typography.Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={openAdd}>Add Customer</Button>
      </div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <Input prefix={<SearchOutlined />} placeholder="Search name, phone, GST…" style={{ width: 300 }} allowClear value={search} onChange={e => setSearch(e.target.value)} />
        <span style={{ alignSelf: 'center', color: '#888', fontSize: 12 }}>{filtered.length} customer{filtered.length !== 1 ? 's' : ''}</span>
      </div>
      <Table dataSource={filtered} columns={columns} rowKey="id" loading={isLoading} size="small" />

      <Modal title={editing ? 'Edit Customer' : 'Add Customer'} open={open} onOk={onSave} onCancel={() => setOpen(false)} width={560}>
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
            <Col span={8}><Form.Item label="Village" name="village"><Input /></Form.Item></Col>
            <Col span={8}><Form.Item label="District" name="district"><Input /></Form.Item></Col>
            <Col span={8}>
              <Form.Item label="State" name="state" initialValue={DEFAULT_STATE}>
                <Select showSearch optionFilterProp="label" options={INDIA_STATES.map(s => ({ value: s, label: s }))} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item label="Address" name="address"><Input /></Form.Item>
          <Row gutter={12}>
            <Col span={12}><Form.Item label="GST Number" name="gstNumber"><Input /></Form.Item></Col>
            <Col span={12}>
              <Form.Item label="Payment Terms (days)" name="paymentTerms" initialValue={DEFAULT_PAYMENT_TERMS_DAYS}>
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>
    </div>
  )
}
