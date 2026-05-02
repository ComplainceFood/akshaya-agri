import { useState } from 'react'
import { Table, Button, Modal, Form, Input, Typography, message, Tag } from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import { useCommodities, useCreateCommodity } from '../../api/hooks'

export default function CommoditiesPage() {
  const [open, setOpen] = useState(false)
  const [form] = Form.useForm()
  const { data: commodities = [], isLoading } = useCommodities()
  const { mutateAsync: create } = useCreateCommodity()

  async function onSave() {
    const values = await form.validateFields()
    try {
      await create(values); message.success('Commodity added'); setOpen(false); form.resetFields()
    } catch { message.error('Error saving') }
  }

  const columns = [
    { title: 'Name', dataIndex: 'name', key: 'name' },
    { title: 'Description', dataIndex: 'description', key: 'desc', render: (v: string) => v || '—' },
    { title: 'Status', dataIndex: 'isActive', key: 'status', render: (v: boolean) => <Tag color={v ? 'green' : 'red'}>{v ? 'Active' : 'Inactive'}</Tag> },
  ]

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <Typography.Title level={4} style={{ margin: 0 }}>Commodities</Typography.Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => { form.resetFields(); setOpen(true) }}>Add Commodity</Button>
      </div>
      <Table dataSource={commodities} columns={columns} rowKey="id" loading={isLoading} />
      <Modal title="Add Commodity" open={open} onOk={onSave} onCancel={() => setOpen(false)}>
        <Form form={form} layout="vertical">
          <Form.Item label="Commodity Name" name="name" rules={[{ required: true }]}><Input placeholder="e.g. Maize (Yellow)" /></Form.Item>
          <Form.Item label="Description" name="description"><Input.TextArea rows={2} /></Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
