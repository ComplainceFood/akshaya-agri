import { useState } from 'react'
import { Table, Button, Modal, Form, Input, Space, Typography, Popconfirm, message } from 'antd'
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons'
import { useSuppliers, useCreateSupplier, useUpdateSupplier, useDeleteSupplier } from '../../api/hooks'

export default function SuppliersPage() {
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<any>(null)
  const [form] = Form.useForm()

  const { data: suppliers = [], isLoading } = useSuppliers()
  const { mutateAsync: create } = useCreateSupplier()
  const { mutateAsync: update } = useUpdateSupplier()
  const { mutateAsync: remove } = useDeleteSupplier()

  function openAdd() { setEditing(null); form.resetFields(); setOpen(true) }
  function openEdit(record: any) { setEditing(record); form.setFieldsValue(record); setOpen(true) }

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
    { title: 'Village / District', key: 'loc', render: (_: any, r: any) => [r.village, r.district].filter(Boolean).join(', ') || '—' },
    { title: 'Bank', dataIndex: 'bankName', key: 'bank', render: (v: string) => v || '—' },
    {
      title: 'Actions', key: 'actions', render: (_: any, r: any) => (
        <Space>
          <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(r)}>Edit</Button>
          <Popconfirm title="Deactivate this supplier?" onConfirm={() => remove(r.id).then(() => message.success('Supplier removed'))}>
            <Button size="small" danger icon={<DeleteOutlined />}>Remove</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <Typography.Title level={4} style={{ margin: 0 }}>Suppliers</Typography.Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={openAdd}>Add Supplier</Button>
      </div>

      <Table dataSource={suppliers} columns={columns} rowKey="id" loading={isLoading} />

      <Modal title={editing ? 'Edit Supplier' : 'Add Supplier'} open={open} onOk={onSave} onCancel={() => setOpen(false)} width={640}>
        <Form form={form} layout="vertical">
          <Form.Item label="Supplier Name" name="name" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item label="Contact Person" name="contactPerson"><Input /></Form.Item>
          <Form.Item label="Phone" name="phone" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item label="Email" name="email"><Input /></Form.Item>
          <Form.Item label="Village" name="village"><Input /></Form.Item>
          <Form.Item label="District" name="district"><Input /></Form.Item>
          <Form.Item label="State" name="state" initialValue="Maharashtra"><Input /></Form.Item>
          <Form.Item label="Address" name="address"><Input.TextArea rows={2} /></Form.Item>
          <Typography.Text strong>Bank Details</Typography.Text>
          <Form.Item label="Bank Name" name="bankName" style={{ marginTop: 8 }}><Input /></Form.Item>
          <Form.Item label="Account Number" name="bankAccount"><Input /></Form.Item>
          <Form.Item label="IFSC Code" name="bankIfsc"><Input /></Form.Item>
          <Form.Item label="PAN Number" name="panNumber"><Input /></Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
