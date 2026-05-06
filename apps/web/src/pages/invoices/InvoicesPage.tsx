import { useState, useMemo } from 'react'
import {
  Typography, DatePicker, Button, Table, Space, Tag, Card, Row, Col,
  Statistic, Modal, Tabs, Select, message, Popconfirm, Tooltip, Alert, Badge,
} from 'antd'
import {
  SendOutlined, FileDoneOutlined, EyeOutlined, DeleteOutlined,
  ThunderboltOutlined, CalendarOutlined, MailOutlined, FilePdfOutlined,
} from '@ant-design/icons'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../api/client'
import { printInvoice, generatePdfBase64 } from './InvoicePrint'
import { useCustomers, useCommodities } from '../../api/hooks'
import { formatINR, formatQt } from '../../utils/format'
import dayjs from 'dayjs'

const { RangePicker } = DatePicker

// ── hooks ────────────────────────────────────────────────────────────────────
function useInvoices(params?: any) {
  return useQuery({
    queryKey: ['invoices', params],
    queryFn: () => api.get('/invoices', { params }).then(r => r.data),
  })
}

function useInvoice(id: string | null) {
  return useQuery({
    queryKey: ['invoice', id],
    queryFn: () => api.get(`/invoices/${id}`).then(r => r.data),
    enabled: !!id,
  })
}

function usePreviewInvoices() {
  return useMutation({
    mutationFn: (body: any) => api.post('/invoices/preview', body).then(r => r.data),
  })
}

function useGenerateInvoices() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (groups: any[]) => api.post('/invoices/generate', { groups }).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['invoices'] }),
  })
}

function useSendInvoice() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, pdfBase64 }: { id: string; pdfBase64?: string }) =>
      api.post(`/invoices/${id}/send`, { pdfBase64 }).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['invoices'] }),
  })
}

function useDeleteInvoice() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.delete(`/invoices/${id}`).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['invoices'] }),
  })
}

// ── Invoice Preview Modal ─────────────────────────────────────────────────────
function InvoiceDetailModal({ id, onClose }: { id: string; onClose: () => void }) {
  const { data: inv, isLoading } = useInvoice(id)
  const { mutateAsync: send, isPending: sending } = useSendInvoice()

  if (!inv && !isLoading) return null

  const customer = inv?.customer ?? {}
  const billingAddr = [customer.billingAddress, customer.billingVillage, customer.billingDistrict, customer.billingState]
    .filter(Boolean).join(', ')

  const itemColumns = [
    { title: 'Slip / LR No.', dataIndex: 'lrNumber', key: 'lr', render: (v: string) => v || '-' },
    { title: 'Vehicle', dataIndex: 'vehicleNumber', key: 'vh' },
    { title: 'Weight (Qt)', dataIndex: 'weight', key: 'wt', align: 'right' as const, render: formatQt },
    { title: 'Rate (₹/Qt)', dataIndex: 'saleRate', key: 'sr', align: 'right' as const, render: (v: number) => v ? `₹${Number(v).toLocaleString('en-IN', { maximumFractionDigits: 2 })}` : '-' },
    { title: 'Amount', dataIndex: 'amount', key: 'amt', align: 'right' as const, render: (v: number) => <b>{formatINR(v)}</b> },
  ]

  async function handleSend() {
    try {
      message.loading({ content: 'Generating PDF…', key: 'send' })
      const pdfBase64 = await generatePdfBase64(inv).catch(() => undefined)
      message.loading({ content: 'Sending email…', key: 'send' })
      await send({ id, pdfBase64 })
      message.success({ content: 'Invoice sent with PDF attachment', key: 'send' })
      onClose()
    } catch (e: any) {
      message.error({ content: e?.response?.data?.error || 'Failed to send invoice', key: 'send' })
    }
  }

  return (
    <Modal
      title={<Space><FileDoneOutlined /><span>Invoice {inv?.invoiceNumber}</span><Tag color={inv?.status === 'SENT' ? 'green' : inv?.status === 'PAID' ? 'blue' : 'default'}>{inv?.status}</Tag></Space>}
      open={!!id}
      onCancel={onClose}
      width={760}
      footer={
        <Space>
          <Button onClick={onClose}>Close</Button>
          {inv && (
            <Button icon={<FilePdfOutlined />} onClick={() => printInvoice(inv)}>
              Download PDF
            </Button>
          )}
          {inv?.status === 'DRAFT' && (
            <Button type="primary" icon={<SendOutlined />} loading={sending} onClick={handleSend}>
              Send to {customer.email || 'customer email'}
            </Button>
          )}
          {inv?.status === 'SENT' && <Tag color="green"><MailOutlined /> Sent to {customer.email}</Tag>}
        </Space>
      }
    >
      {inv && (
        <div>
          {!customer.email && inv.status === 'DRAFT' && (
            <Alert type="warning" message="Customer has no email address. Update the customer record before sending." style={{ marginBottom: 12 }} />
          )}
          <Row gutter={16} style={{ marginBottom: 16 }}>
            <Col span={12}>
              <div style={{ fontSize: 11, color: '#888', marginBottom: 4, textTransform: 'uppercase' }}>Bill To</div>
              <div style={{ fontWeight: 600 }}>{customer.name}</div>
              <div style={{ color: '#555', fontSize: 13 }}>{billingAddr || 'No address on file'}</div>
              {customer.gstNumber && <div style={{ color: '#555', fontSize: 13 }}>GSTIN: {customer.gstNumber}</div>}
              {customer.email && <div style={{ color: '#1677ff', fontSize: 13 }}>{customer.email}</div>}
            </Col>
            <Col span={12} style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 11, color: '#888', marginBottom: 4, textTransform: 'uppercase' }}>Invoice Details</div>
              <div><b>Date:</b> {dayjs(inv.invoiceDate).format('DD MMM YYYY')}</div>
              <div><b>Commodity:</b> {inv.commodity?.name}</div>
              {inv.commodity?.hsnCode && <div><b>HSN:</b> {inv.commodity.hsnCode}</div>}
            </Col>
          </Row>
          <Table
            dataSource={inv.items || []}
            columns={itemColumns}
            rowKey="id"
            size="small"
            pagination={false}
            loading={isLoading}
            summary={() => (
              <Table.Summary.Row style={{ fontWeight: 700, background: '#f9f9f9' }}>
                <Table.Summary.Cell index={0} colSpan={2}>Total</Table.Summary.Cell>
                <Table.Summary.Cell index={2} align="right">{formatQt(inv.totalWeight)}</Table.Summary.Cell>
                <Table.Summary.Cell index={3} />
                <Table.Summary.Cell index={4} align="right"><span style={{ color: '#1677ff', fontSize: 15 }}>{formatINR(inv.totalAmount)}</span></Table.Summary.Cell>
              </Table.Summary.Row>
            )}
          />
        </div>
      )}
    </Modal>
  )
}

// ── Generate Tab ──────────────────────────────────────────────────────────────
function GenerateTab() {
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs] | null>(null)
  const [selectedCustomers, setSelectedCustomers] = useState<string[]>([])
  const [previewData, setPreviewData] = useState<any[]>([])
  const [selectedKeys, setSelectedKeys] = useState<string[]>([])
  const { data: customers = [] } = useCustomers()
  const { mutateAsync: preview, isPending: previewing } = usePreviewInvoices()
  const { mutateAsync: generate, isPending: generating } = useGenerateInvoices()

  async function runPreview() {
    if (!dateRange) { message.warning('Select a date range first'); return }
    try {
      const groups = await preview({
        from: dateRange[0].format('YYYY-MM-DD'),
        to: dateRange[1].format('YYYY-MM-DD'),
        customerIds: selectedCustomers.length ? selectedCustomers : undefined,
      })
      setPreviewData(groups)
      setSelectedKeys(groups.map((g: any) => g.key))
      if (groups.length === 0) message.info('No uninvoiced deliveries found for the selected period')
    } catch (e: any) {
      message.error(e?.response?.data?.error || 'Preview failed')
    }
  }

  async function runGenerate() {
    const toGenerate = previewData.filter(g => selectedKeys.includes(g.key))
    if (!toGenerate.length) { message.warning('Select at least one invoice to generate'); return }
    try {
      const created = await generate(toGenerate)
      message.success(`${created.length} invoice(s) generated`)
      setPreviewData([])
      setSelectedKeys([])
    } catch (e: any) {
      message.error(e?.response?.data?.error || 'Generate failed')
    }
  }

  const totalAmount = previewData.filter(g => selectedKeys.includes(g.key)).reduce((s, g) => s + g.totalSaleValue, 0)
  const totalWeight = previewData.filter(g => selectedKeys.includes(g.key)).reduce((s, g) => s + g.totalWeight, 0)

  const previewColumns = [
    { title: 'Date', dataIndex: 'deliveryDate', key: 'date', render: (v: string) => dayjs(v).format('DD MMM YYYY') },
    { title: 'Customer', key: 'customer', render: (_: any, r: any) => <b>{r.customer?.name}</b> },
    { title: 'Commodity', key: 'commodity', render: (_: any, r: any) => r.commodity?.name },
    { title: 'Trips', key: 'trips', render: (_: any, r: any) => <Badge count={r.deliveries.length} color="#1677ff" /> },
    { title: 'Weight (Qt)', dataIndex: 'totalWeight', key: 'wt', align: 'right' as const, render: formatQt },
    { title: 'Sale Rate', dataIndex: 'saleRate', key: 'sr', align: 'right' as const, render: (v: number) => v ? `₹${Number(v).toLocaleString('en-IN', { maximumFractionDigits: 2 })}` : '-' },
    { title: 'Invoice Amount', dataIndex: 'totalSaleValue', key: 'amt', align: 'right' as const, render: (v: number) => <b style={{ color: '#1677ff' }}>{formatINR(v)}</b> },
    {
      title: 'Email', key: 'email', render: (_: any, r: any) => r.customer?.email
        ? <Tooltip title={r.customer.email}><Tag color="green"><MailOutlined /> Ready</Tag></Tooltip>
        : <Tag color="warning">No email</Tag>
    },
  ]

  return (
    <div>
      <Card size="small" style={{ marginBottom: 16 }}>
        <Space wrap size={12}>
          <RangePicker
            format="DD/MM/YYYY"
            onChange={dates => setDateRange(dates as any)}
            placeholder={['From date', 'To date']}
          />
          <Select
            mode="multiple"
            placeholder="All customers (or select specific)"
            style={{ minWidth: 260 }}
            allowClear
            showSearch
            optionFilterProp="label"
            options={customers.map((c: any) => ({ value: c.id, label: c.name }))}
            onChange={setSelectedCustomers}
          />
          <Button type="primary" icon={<CalendarOutlined />} loading={previewing} onClick={runPreview}>
            Preview Invoices
          </Button>
        </Space>
      </Card>

      {previewData.length > 0 && (
        <>
          <Row gutter={[12, 12]} style={{ marginBottom: 12 }}>
            <Col xs={8}>
              <Card size="small"><Statistic title="Invoice Groups" value={selectedKeys.length} suffix={`/ ${previewData.length}`} /></Card>
            </Col>
            <Col xs={8}>
              <Card size="small"><Statistic title="Total Weight" value={formatQt(totalWeight)} /></Card>
            </Col>
            <Col xs={8}>
              <Card size="small"><Statistic title="Total Amount" value={formatINR(totalAmount)} valueStyle={{ color: '#1677ff', fontSize: 16 }} /></Card>
            </Col>
          </Row>

          <Table
            dataSource={previewData}
            columns={previewColumns}
            rowKey="key"
            size="small"
            pagination={false}
            rowSelection={{
              selectedRowKeys: selectedKeys,
              onChange: keys => setSelectedKeys(keys as string[]),
            }}
          />

          <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end' }}>
            <Button
              type="primary"
              icon={<ThunderboltOutlined />}
              loading={generating}
              disabled={!selectedKeys.length}
              onClick={runGenerate}
              size="large"
            >
              Generate {selectedKeys.length} Invoice(s)
            </Button>
          </div>
        </>
      )}
    </div>
  )
}

// ── Invoices List Tab ─────────────────────────────────────────────────────────
function InvoiceListTab() {
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs] | null>(null)
  const [filterCustomer, setFilterCustomer] = useState<string | null>(null)
  const [filterStatus, setFilterStatus] = useState<string | null>(null)
  const [viewId, setViewId] = useState<string | null>(null)
  const { data: customers = [] } = useCustomers()
  const { mutateAsync: send, isPending: sending } = useSendInvoice()
  const { mutateAsync: remove } = useDeleteInvoice()

  const params: any = {}
  if (dateRange) { params.from = dateRange[0].format('YYYY-MM-DD'); params.to = dateRange[1].format('YYYY-MM-DD') }
  if (filterCustomer) params.customerId = filterCustomer
  if (filterStatus) params.status = filterStatus

  const { data: invoices = [], isLoading } = useInvoices(params)

  async function handleSend(id: string) {
    try {
      message.loading({ content: 'Generating PDF…', key: `send-${id}` })
      const fullInv = await api.get(`/invoices/${id}`).then(r => r.data)
      const pdfBase64 = await generatePdfBase64(fullInv).catch(() => undefined)
      message.loading({ content: 'Sending email…', key: `send-${id}` })
      await send({ id, pdfBase64 })
      message.success({ content: 'Invoice sent with PDF attachment', key: `send-${id}` })
    } catch (e: any) {
      message.error({ content: e?.response?.data?.error || 'Failed to send', key: `send-${id}` })
    }
  }

  const statusTag = (s: string) => {
    if (s === 'SENT') return <Tag color="green">Sent</Tag>
    if (s === 'PAID') return <Tag color="blue">Paid</Tag>
    return <Tag>Draft</Tag>
  }

  const columns = [
    { title: 'Invoice No.', dataIndex: 'invoiceNumber', key: 'inv', render: (v: string) => <b>{v}</b> },
    { title: 'Date', dataIndex: 'invoiceDate', key: 'date', render: (v: string) => dayjs(v).format('DD/MM/YYYY') },
    { title: 'Customer', key: 'customer', render: (_: any, r: any) => r.customer?.name },
    { title: 'Commodity', key: 'commodity', render: (_: any, r: any) => r.commodity?.name },
    { title: 'Amount', dataIndex: 'totalAmount', key: 'amt', align: 'right' as const, render: (v: number) => <b style={{ color: '#1677ff' }}>{formatINR(v)}</b> },
    { title: 'Status', dataIndex: 'status', key: 'status', render: statusTag },
    {
      title: 'Actions', key: 'actions', render: (_: any, r: any) => (
        <Space size={4}>
          <Button size="small" icon={<EyeOutlined />} onClick={() => setViewId(r.id)}>View</Button>

          {r.status === 'DRAFT' && r.customer?.email && (
            <Button size="small" type="primary" icon={<SendOutlined />} loading={sending} onClick={() => handleSend(r.id)}>
              Send
            </Button>
          )}
          {r.status === 'DRAFT' && !r.customer?.email && (
            <Tooltip title="Add customer email first"><Button size="small" icon={<SendOutlined />} disabled>Send</Button></Tooltip>
          )}
          {r.status === 'DRAFT' && (
            <Popconfirm title="Delete this draft invoice?" onConfirm={() => remove(r.id).then(() => message.success('Deleted'))}>
              <Button size="small" danger icon={<DeleteOutlined />} />
            </Popconfirm>
          )}
        </Space>
      )
    },
  ]

  const totalOutstanding = useMemo(() =>
    invoices.filter((i: any) => i.status === 'DRAFT' || i.status === 'SENT').reduce((s: number, i: any) => s + Number(i.totalAmount), 0),
    [invoices])

  return (
    <div>
      <Space wrap style={{ marginBottom: 12 }}>
        <RangePicker format="DD/MM/YYYY" onChange={dates => setDateRange(dates as any)} placeholder={['From', 'To']} />
        <Select placeholder="All Customers" allowClear showSearch optionFilterProp="label" style={{ width: 200 }}
          options={customers.map((c: any) => ({ value: c.id, label: c.name }))}
          onChange={v => setFilterCustomer(v ?? null)} />
        <Select placeholder="All Status" allowClear style={{ width: 140 }}
          options={[{ value: 'DRAFT', label: 'Draft' }, { value: 'SENT', label: 'Sent' }, { value: 'PAID', label: 'Paid' }]}
          onChange={v => setFilterStatus(v ?? null)} />
      </Space>

      {totalOutstanding > 0 && (
        <Alert
          type="info"
          style={{ marginBottom: 12 }}
          message={<span>Total outstanding (Draft + Sent): <b>{formatINR(totalOutstanding)}</b> across {invoices.filter((i: any) => i.status !== 'PAID').length} invoices</span>}
        />
      )}

      <Table
        dataSource={invoices}
        columns={columns}
        rowKey="id"
        loading={isLoading}
        size="small"
        pagination={{ pageSize: 50, showTotal: t => `${t} invoices` }}
      />

      {viewId && <InvoiceDetailModal id={viewId} onClose={() => setViewId(null)} />}
    </div>
  )
}

// ── Bulk Send Tab ─────────────────────────────────────────────────────────────
function BulkSendTab() {
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs] | null>(null)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const { mutateAsync: send } = useSendInvoice()
  const qc = useQueryClient()

  const params: any = { status: 'DRAFT' }
  if (dateRange) { params.from = dateRange[0].format('YYYY-MM-DD'); params.to = dateRange[1].format('YYYY-MM-DD') }
  const { data: drafts = [], isLoading } = useInvoices(params)

  const readyToSend = drafts.filter((i: any) => i.customer?.email)
  const noEmail = drafts.filter((i: any) => !i.customer?.email)

  async function sendSelected() {
    let ok = 0, fail = 0
    for (const id of selectedIds) {
      try {
        const fullInv = await api.get(`/invoices/${id}`).then(r => r.data)
        const pdfBase64 = await generatePdfBase64(fullInv).catch(() => undefined)
        await send({ id, pdfBase64 })
        ok++
      } catch { fail++ }
    }
    if (ok) message.success(`${ok} invoice(s) sent with PDF`)
    if (fail) message.warning(`${fail} failed`)
    setSelectedIds([])
    qc.invalidateQueries({ queryKey: ['invoices'] })
  }

  const columns = [
    { title: 'Invoice No.', dataIndex: 'invoiceNumber', key: 'inv', render: (v: string) => <b>{v}</b> },
    { title: 'Date', dataIndex: 'invoiceDate', key: 'date', render: (v: string) => dayjs(v).format('DD/MM/YYYY') },
    { title: 'Customer', key: 'customer', render: (_: any, r: any) => r.customer?.name },
    { title: 'Commodity', key: 'commodity', render: (_: any, r: any) => r.commodity?.name },
    { title: 'Amount', dataIndex: 'totalAmount', key: 'amt', align: 'right' as const, render: (v: number) => <b>{formatINR(v)}</b> },
    { title: 'Email', key: 'email', render: (_: any, r: any) => r.customer?.email
        ? <Tag color="green"><MailOutlined /> {r.customer.email}</Tag>
        : <Tag color="warning">No email</Tag>
    },
  ]

  return (
    <div>
      <Alert
        type="info"
        style={{ marginBottom: 12 }}
        message="Select DRAFT invoices below and send them all at once. Customers without email addresses are shown but cannot be selected."
      />
      <Space wrap style={{ marginBottom: 12 }}>
        <RangePicker format="DD/MM/YYYY" onChange={dates => setDateRange(dates as any)} placeholder={['From', 'To']} />
        {noEmail.length > 0 && <Tag color="warning">{noEmail.length} customers missing email</Tag>}
      </Space>
      <Table
        dataSource={readyToSend}
        columns={columns}
        rowKey="id"
        loading={isLoading}
        size="small"
        rowSelection={{
          selectedRowKeys: selectedIds,
          onChange: keys => setSelectedIds(keys as string[]),
        }}
        pagination={false}
      />
      {selectedIds.length > 0 && (
        <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end' }}>
          <Button type="primary" icon={<SendOutlined />} size="large" onClick={sendSelected}>
            Send {selectedIds.length} Invoice(s) via Email
          </Button>
        </div>
      )}
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function InvoicesPage() {
  return (
    <div>
      <Typography.Title level={4} style={{ marginBottom: 16 }}>Invoices</Typography.Title>
      <Tabs
        items={[
          { key: 'generate', label: <><ThunderboltOutlined /> Generate</>, children: <GenerateTab /> },
          { key: 'list', label: <><FileDoneOutlined /> All Invoices</>, children: <InvoiceListTab /> },
          { key: 'bulk', label: <><SendOutlined /> Bulk Send</>, children: <BulkSendTab /> },
        ]}
      />
    </div>
  )
}
