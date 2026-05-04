import { useState, useMemo } from 'react'
import { Table, Button, Modal, Form, InputNumber, Select, DatePicker, Space, Typography, Tooltip, Popconfirm, message, Row, Col, Input } from 'antd'
import { PlusOutlined, EditOutlined, DeleteOutlined, SearchOutlined } from '@ant-design/icons'
import { useSalesOrders, useCreateSalesOrder, useUpdateSalesOrder, useDeleteSalesOrder, useCommodities } from '../../api/hooks'
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
      onChange={v => setDraft(v)} onBlur={commit} onPressEnter={commit} style={{ width: 100 }} />
  }
  const display = value != null ? `${prefix ?? ''}${Number(value).toLocaleString('en-IN', { maximumFractionDigits: decimals })}` : '-'
  return (
    <Tooltip title="Click to edit">
      <span onClick={start} style={{ cursor: 'pointer', borderBottom: '1px dashed #aaa', whiteSpace: 'nowrap' }}>{display}</span>
    </Tooltip>
  )
}

export default function SaleRatesPage() {
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<any>(null)
  const [search, setSearch] = useState('')
  const [filterCommodity, setFilterCommodity] = useState<string>('')
  const [form] = Form.useForm()

  const { data: rates = [], isLoading } = useSalesOrders()
  const { data: commodities = [] } = useCommodities()
  const { mutateAsync: create } = useCreateSalesOrder()
  const { mutateAsync: update } = useUpdateSalesOrder()
  const { mutateAsync: remove } = useDeleteSalesOrder()

  const filtered = useMemo(() => rates.filter((r: any) => {
    if (filterCommodity && r.commodityId !== filterCommodity) return false
    if (search && !r.commodity?.name?.toLowerCase().includes(search.toLowerCase())) return false
    return true
  }), [rates, filterCommodity, search])

  function openAdd() { setEditing(null); form.resetFields(); setOpen(true) }
  function openEdit(r: any) { setEditing(r); form.setFieldsValue({ ...r, rateDate: dayjs(r.rateDate) }); setOpen(true) }

  async function onSave() {
    const values = await form.validateFields()
    const payload = { ...values, rateDate: values.rateDate.format('YYYY-MM-DD') }
    try {
      if (editing) { await update({ id: editing.id, ...payload }); message.success('Rate updated') }
      else { await create(payload); message.success('Sale rate saved') }
      setOpen(false)
    } catch { message.error('Error saving') }
  }

  function patch(id: string, fields: Record<string, any>) {
    update({ id, ...fields }).catch(() => message.error('Failed to save'))
  }

  const columns = [
    { title: 'Date', dataIndex: 'rateDate', key: 'date', render: (v: string) => dayjs(v).format('DD/MM/YYYY'), sorter: (a: any, b: any) => a.rateDate.localeCompare(b.rateDate), defaultSortOrder: 'descend' as const },
    { title: 'Commodity', dataIndex: ['commodity', 'name'], key: 'commodity' },
    {
      title: 'Sale Rate (₹/Qt)', key: 'rate', width: 170,
      render: (_: any, r: any) => (
        <InlineNum value={Number(r.ratePerQuintal)} step={0.5} decimals={2} prefix="₹"
          onSave={v => patch(r.id, { ratePerQuintal: v })} />
      ),
    },
    { title: 'Notes', dataIndex: 'notes', key: 'notes', ellipsis: true },
    {
      title: 'Actions', key: 'actions', render: (_: any, r: any) => (
        <Space>
          <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(r)}>Edit</Button>
          <Popconfirm title="Delete this rate?" onConfirm={() => remove(r.id).then(() => message.success('Deleted')).catch((e: any) => message.error(e?.response?.data?.error || 'Cannot delete'))}>
            <Button size="small" danger icon={<DeleteOutlined />}>Delete</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <div>
      <div className="page-header">
        <div>
          <Typography.Title level={4} className="page-title">Sale Rates</Typography.Title>
          <div className="page-subtitle">Set daily commodity sale rates for customer invoicing</div>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={openAdd}>Set Rate</Button>
      </div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <Input prefix={<SearchOutlined />} placeholder="Search commodity…" style={{ width: 220 }} allowClear value={search} onChange={e => setSearch(e.target.value)} />
        <Select placeholder="Filter by Commodity" style={{ width: 200 }} allowClear showSearch optionFilterProp="label"
          options={commodities.map((c: any) => ({ value: c.id, label: c.name }))}
          onChange={v => setFilterCommodity(v || '')} />
        <span style={{ alignSelf: 'center', color: '#888', fontSize: 12 }}>{filtered.length} rate{filtered.length !== 1 ? 's' : ''}</span>
      </div>
      <Table dataSource={filtered} columns={columns} rowKey="id" loading={isLoading} size="small" />

      <Modal title={editing ? 'Edit Sale Rate' : 'Set Sale Rate'} open={open} onOk={onSave} onCancel={() => setOpen(false)} width={420}>
        <Form form={form} layout="vertical" size="small">
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item label="Date" name="rateDate" rules={[{ required: true }]}>
                <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="Commodity" name="commodityId" rules={[{ required: true }]}>
                <Select showSearch optionFilterProp="label" options={commodities.map((c: any) => ({ value: c.id, label: c.name }))} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item label="Rate (₹/Quintal)" name="ratePerQuintal" rules={[{ required: true }]}>
            <InputNumber min={0} style={{ width: '100%' }} step={0.5} precision={2} />
          </Form.Item>
          <Form.Item label="Notes" name="notes"><Input.TextArea rows={2} /></Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
