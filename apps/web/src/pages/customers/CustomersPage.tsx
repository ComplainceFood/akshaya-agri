import { useState } from 'react'
import { Table, Button, Modal, Form, Input, InputNumber, Space, Typography, message } from 'antd'
import { PlusOutlined, EditOutlined } from '@ant-design/icons'
import { useCustomers, useCreateCustomer, useUpdateCustomer } from '../../api/hooks'

export default function CustomersPage() {
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<any>(null)
  const [form] = Form.useForm()

  const { data: customers = [], isLoading } = useCustomers()
  const { mutateAsync: create } = useCreateCustomer()
  const { mutateAsync: update } = useUpdateCustomer()

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
    { title: 'Payment Terms', dataIndex: 'paymentTerms', key: 'pt', render: (v: number) => `${v} days` },
    {
      title: 'Actions', key: 'actions', render: (_: any, r: any) => (
        <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(r)}>Edit</Button>
      ),
    },
  ]

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <Typography.Title level={4} style={{ margin: 0 }}>Customers (Buyers)</Typography.Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={openAdd}>Add Customer</Button>
      </div>
      <Table dataSource={customers} columns={columns} rowKey="id" loading={isLoading} />
      <Modal title={editing ? 'Edit Customer' : 'Add Customer'} open={open} onOk={onSave} onCancel={() => setOpen(false)}>
        <Form form={form} layout="vertical">
          <Form.Item label="Company Name" name="name" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item label="Contact Person" name="contactPerson"><Input /></Form.Item>
          <Form.Item label="Phone" name="phone" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item label="Email" name="email"><Input /></Form.Item>
          <Form.Item label="Address" name="address"><Input.TextArea rows={2} /></Form.Item>
          <Form.Item label="GST Number" name="gstNumber"><Input /></Form.Item>
          <Form.Item label="Payment Terms (days)" name="paymentTerms" initialValue={30}>
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
