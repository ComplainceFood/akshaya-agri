import { useState, useMemo } from 'react'
import { Table, Button, Modal, Form, Input, Select, Space, Typography, Popconfirm, message, Row, Col, Divider } from 'antd'
import { PlusOutlined, EditOutlined, DeleteOutlined, SearchOutlined } from '@ant-design/icons'
import { useSuppliers, useCreateSupplier, useUpdateSupplier, useDeleteSupplier } from '../../api/hooks'
import { DEFAULT_STATE } from '../../utils/constants'

const INDIA_STATES = [
  'Andhra Pradesh','Arunachal Pradesh','Assam','Bihar','Chhattisgarh','Goa','Gujarat',
  'Haryana','Himachal Pradesh','Jharkhand','Karnataka','Kerala','Madhya Pradesh',
  'Maharashtra','Manipur','Meghalaya','Mizoram','Nagaland','Odisha','Punjab','Rajasthan',
  'Sikkim','Tamil Nadu','Telangana','Tripura','Uttar Pradesh','Uttarakhand','West Bengal',
  'Andaman and Nicobar Islands','Chandigarh','Dadra and Nagar Haveli and Daman and Diu',
  'Delhi','Jammu and Kashmir','Ladakh','Lakshadweep','Puducherry',
]

export default function SuppliersPage() {
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<any>(null)
  const [search, setSearch] = useState('')
  const [form] = Form.useForm()

  const { data: suppliers = [], isLoading } = useSuppliers()

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return q ? suppliers.filter((s: any) => s.name?.toLowerCase().includes(q) || s.phone?.toLowerCase().includes(q) || s.village?.toLowerCase().includes(q) || s.district?.toLowerCase().includes(q)) : suppliers
  }, [suppliers, search])
  const { mutateAsync: create } = useCreateSupplier()
  const { mutateAsync: update } = useUpdateSupplier()
  const { mutateAsync: remove } = useDeleteSupplier()

  function openAdd() { setEditing(null); form.resetFields(); setOpen(true) }
  function openEdit(r: any) { setEditing(r); form.setFieldsValue(r); setOpen(true) }

  async function onSave() {
    const values = await form.validateFields()
    try {
      if (editing) { await update({ id: editing.id, ...values }); message.success('Supplier updated') }
      else { await create(values); message.success('Supplier added') }
      setOpen(false)
    } catch { message.error('Error saving supplier') }
  }

  const columns = [
    { title: 'Name', dataIndex: 'name', key: 'name' },
    { title: 'Contact Person', dataIndex: 'contactPerson', key: 'cp' },
    { title: 'Phone', dataIndex: 'phone', key: 'phone' },
    { title: 'Village / District', key: 'loc', render: (_: any, r: any) => [r.village, r.district].filter(Boolean).join(', ') || '-' },
    { title: 'Bank', dataIndex: 'bankName', key: 'bank', render: (v: string) => v || '-' },
    {
      title: 'Actions', key: 'actions', render: (_: any, r: any) => (
        <Space>
          <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(r)}>Edit</Button>
          <Popconfirm title="Remove this supplier?" onConfirm={() => remove(r.id).then(() => message.success('Supplier removed'))}>
            <Button size="small" danger icon={<DeleteOutlined />}>Remove</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
        <Typography.Title level={4} style={{ margin: 0 }}>Suppliers</Typography.Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={openAdd}>Add Supplier</Button>
      </div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <Input prefix={<SearchOutlined />} placeholder="Search name, phone, village, district…" style={{ width: 320 }} allowClear value={search} onChange={e => setSearch(e.target.value)} />
        <span style={{ alignSelf: 'center', color: '#888', fontSize: 12 }}>{filtered.length} supplier{filtered.length !== 1 ? 's' : ''}</span>
      </div>
      <Table dataSource={filtered} columns={columns} rowKey="id" loading={isLoading} size="small" />

      <Modal title={editing ? 'Edit Supplier' : 'Add Supplier'} open={open} onOk={onSave} onCancel={() => setOpen(false)} width={600}>
        <Form form={form} layout="vertical" size="small">
          <Row gutter={12}>
            <Col span={14}><Form.Item label="Supplier Name" name="name" rules={[{ required: true }]}><Input /></Form.Item></Col>
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
          <Divider orientation="left" orientationMargin={0} style={{ margin: '6px 0' }}>Bank Details</Divider>
          <Row gutter={12}>
            <Col span={12}><Form.Item label="Bank Name" name="bankName"><Input /></Form.Item></Col>
            <Col span={12}><Form.Item label="Account Number" name="bankAccount"><Input /></Form.Item></Col>
          </Row>
          <Row gutter={12}>
            <Col span={12}><Form.Item label="IFSC Code" name="bankIfsc"><Input /></Form.Item></Col>
            <Col span={12}><Form.Item label="PAN Number" name="panNumber"><Input /></Form.Item></Col>
          </Row>
        </Form>
      </Modal>
    </div>
  )
}
