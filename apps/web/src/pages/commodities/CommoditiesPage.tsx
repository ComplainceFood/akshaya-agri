import { useState } from 'react'
import { Table, Button, Modal, Form, Input, Typography, message, Tag, Space, Popconfirm } from 'antd'
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons'
import { useCommodities, useCreateCommodity, useUpdateCommodity, useDeleteCommodity } from '../../api/hooks'

export default function CommoditiesPage() {
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<any>(null)
  const [form] = Form.useForm()
  const { data: commodities = [], isLoading } = useCommodities()
  const { mutateAsync: create } = useCreateCommodity()
  const { mutateAsync: update } = useUpdateCommodity()
  const { mutateAsync: remove } = useDeleteCommodity()

  function openAdd() { setEditing(null); form.resetFields(); setOpen(true) }
  function openEdit(r: any) { setEditing(r); form.setFieldsValue(r); setOpen(true) }

  async function onSave() {
    const values = await form.validateFields()
    try {
      if (editing) { await update({ id: editing.id, ...values }); message.success('Commodity updated') }
      else { await create(values); message.success('Commodity added') }
      setOpen(false); form.resetFields(); setEditing(null)
    } catch { message.error('Error saving') }
  }

  const columns = [
    { title: 'Name', dataIndex: 'name', key: 'name' },
    { title: 'Description', dataIndex: 'description', key: 'desc', render: (v: string) => v || '—' },
    { title: 'Status', dataIndex: 'isActive', key: 'status', render: (v: boolean) => <Tag color={v ? 'green' : 'red'}>{v ? 'Active' : 'Inactive'}</Tag> },
    {
      title: 'Actions', key: 'actions', render: (_: any, r: any) => (
        <Space>
          <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(r)}>Edit</Button>
          <Popconfirm title="Remove this commodity?" onConfirm={() => remove(r.id).then(() => message.success('Removed')).catch((e: any) => message.error(e?.response?.data?.error || 'Cannot remove'))}>
            <Button size="small" danger icon={<DeleteOutlined />}>Remove</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <Typography.Title level={4} style={{ margin: 0 }}>Commodities</Typography.Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={openAdd}>Add Commodity</Button>
      </div>
      <Table dataSource={commodities} columns={columns} rowKey="id" loading={isLoading} />
      <Modal title={editing ? 'Edit Commodity' : 'Add Commodity'} open={open} onOk={onSave} onCancel={() => { setOpen(false); setEditing(null) }} width={420}>
        <Form form={form} layout="vertical" size="small">
          <Form.Item label="Commodity Name" name="name" rules={[{ required: true }]}>
            <Input placeholder="e.g. Maize (Yellow)" />
          </Form.Item>
          <Form.Item label="Description" name="description">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
