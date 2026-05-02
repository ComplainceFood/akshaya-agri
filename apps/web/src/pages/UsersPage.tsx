import { useState } from 'react'
import { Table, Button, Modal, Form, Input, Select, Typography, Tag, message } from 'antd'
import { PlusOutlined, EditOutlined } from '@ant-design/icons'
import { useUsers, useCreateUser, useUpdateUser } from '../api/hooks'
import { useAuthStore } from '../store/auth'

const ROLES = [
  { value: 'ADMIN', label: 'Admin' },
  { value: 'OPERATIONS', label: 'Operations' },
  { value: 'ACCOUNTS', label: 'Accounts' },
]

export default function UsersPage() {
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<any>(null)
  const [form] = Form.useForm()
  const currentUser = useAuthStore((s) => s.user)

  const { data: users = [], isLoading } = useUsers()
  const { mutateAsync: create } = useCreateUser()
  const { mutateAsync: update } = useUpdateUser()

  function openAdd() { setEditing(null); form.resetFields(); setOpen(true) }
  function openEdit(r: any) { setEditing(r); form.setFieldsValue({ ...r, password: '' }); setOpen(true) }

  async function onSave() {
    const values = await form.validateFields()
    if (editing && !values.password) delete values.password
    try {
      if (editing) { await update({ id: editing.id, ...values }); message.success('User updated') }
      else { await create(values); message.success('User created') }
      setOpen(false)
    } catch (e: any) { message.error(e?.response?.data?.error || 'Error saving user') }
  }

  const columns = [
    { title: 'Name', dataIndex: 'name', key: 'name' },
    { title: 'Email', dataIndex: 'email', key: 'email' },
    { title: 'Role', dataIndex: 'role', key: 'role', render: (v: string) => <Tag color={v === 'ADMIN' ? 'red' : v === 'ACCOUNTS' ? 'blue' : 'green'}>{v}</Tag> },
    { title: 'Status', dataIndex: 'isActive', key: 'status', render: (v: boolean) => <Tag color={v ? 'green' : 'red'}>{v ? 'Active' : 'Inactive'}</Tag> },
    {
      title: 'Actions', key: 'actions', render: (_: any, r: any) =>
        currentUser?.role === 'ADMIN' ? <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(r)}>Edit</Button> : null,
    },
  ]

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <Typography.Title level={4} style={{ margin: 0 }}>Users</Typography.Title>
        {currentUser?.role === 'ADMIN' && <Button type="primary" icon={<PlusOutlined />} onClick={openAdd}>Add User</Button>}
      </div>
      <Table dataSource={users} columns={columns} rowKey="id" loading={isLoading} />
      <Modal title={editing ? 'Edit User' : 'Add User'} open={open} onOk={onSave} onCancel={() => setOpen(false)}>
        <Form form={form} layout="vertical">
          <Form.Item label="Full Name" name="name" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item label="Email" name="email" rules={[{ required: !editing, type: 'email' }]}>
            <Input disabled={!!editing} />
          </Form.Item>
          <Form.Item label={editing ? 'New Password (leave blank to keep)' : 'Password'} name="password" rules={editing ? [] : [{ required: true, min: 6 }]}>
            <Input.Password />
          </Form.Item>
          <Form.Item label="Role" name="role" rules={[{ required: true }]}>
            <Select options={ROLES} />
          </Form.Item>
          {editing && (
            <Form.Item label="Status" name="isActive">
              <Select options={[{ value: true, label: 'Active' }, { value: false, label: 'Inactive' }]} />
            </Form.Item>
          )}
        </Form>
      </Modal>
    </div>
  )
}
