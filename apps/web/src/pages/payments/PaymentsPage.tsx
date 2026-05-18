import { useMemo, useState } from 'react'
import {
  Tabs, Table, Button, Modal, Form, Input, InputNumber, Select,
  DatePicker, Typography, message, Card, Statistic, Row, Col, Tag, Empty, Space,
  Popconfirm, Tooltip,
} from 'antd'
import {
  PlusOutlined, ArrowDownOutlined, ArrowUpOutlined, BankOutlined,
  EditOutlined, DeleteOutlined, EyeOutlined, ExclamationCircleFilled,
} from '@ant-design/icons'
import ImportBankStatement from './ImportBankStatement'
import {
  useSupplierPayments, useCreateSupplierPayment, useUpdateSupplierPayment,
  useDeleteSupplierPayment, useBulkUpdateSupplierPayments, useBulkDeleteSupplierPayments,
  useSupplierLedger,
  useCustomerReceipts, useCreateCustomerReceipt, useUpdateCustomerReceipt,
  useDeleteCustomerReceipt, useBulkUpdateCustomerReceipts, useBulkDeleteCustomerReceipts,
  useCustomerLedger,
  useSuppliers, useCustomers,
} from '../../api/hooks'
import { formatINR } from '../../utils/format'
import dayjs from 'dayjs'

const PAYMENT_MODES = ['NEFT', 'RTGS', 'IMPS', 'CHEQUE', 'CASH', 'OTHER'].map(v => ({ value: v, label: v }))

const modeColor: Record<string, string> = {
  NEFT: 'blue', RTGS: 'purple', IMPS: 'cyan', CHEQUE: 'orange', CASH: 'green', OTHER: 'default',
}

type ModalMode = 'create' | 'edit' | 'view'

function LedgerSummary({ type, id }: { type: 'supplier' | 'customer'; id: string }) {
  const spData = useSupplierLedger(type === 'supplier' ? id : '').data
  const crData = useCustomerLedger(type === 'customer' ? id : '').data
  const data = type === 'supplier' ? spData : crData
  if (!data) return null

  const isSupplier = type === 'supplier'
  return (
    <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
      <Col xs={8}>
        <Card size="small" className="stat-card">
          <Statistic
            title={isSupplier ? 'Total Purchase Value' : 'Total Sale Value'}
            value={formatINR(isSupplier ? data.totalPurchase : data.totalSale)}
            valueStyle={{ fontSize: 15 }}
          />
        </Card>
      </Col>
      <Col xs={8}>
        <Card size="small" className="stat-card">
          <Statistic
            title={isSupplier ? 'Total Paid' : 'Total Received'}
            value={formatINR(isSupplier ? data.totalPaid : data.totalReceived)}
            valueStyle={{ color: '#2e7d32', fontSize: 15 }}
            prefix={<ArrowUpOutlined />}
          />
        </Card>
      </Col>
      <Col xs={8}>
        <Card size="small" className="stat-card">
          <Statistic
            title="Outstanding"
            value={formatINR(data.outstanding)}
            valueStyle={{ color: data.outstanding > 0 ? '#cf1322' : '#2e7d32', fontSize: 15 }}
            prefix={data.outstanding > 0 ? <ArrowDownOutlined /> : undefined}
          />
        </Card>
      </Col>
    </Row>
  )
}

function PaymentForm({
  type, suppliers, customers, readOnly,
}: { type: 'supplier' | 'customer'; suppliers: any[]; customers: any[]; readOnly?: boolean }) {
  const isSupplier = type === 'supplier'
  const [selectedSupplierId, setSelectedSupplierId] = useState<string | null>(null)
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null)
  const selectedSupplier = suppliers.find((s: any) => s.id === selectedSupplierId)
  const { data: spLedger } = useSupplierLedger(selectedSupplierId ?? '')
  const { data: crLedger } = useCustomerLedger(selectedCustomerId ?? '')

  return (
    <>
      <Row gutter={12}>
        <Col span={14}>
          <Form.Item label={isSupplier ? 'Supplier' : 'Customer'} name={isSupplier ? 'supplierId' : 'customerId'}>
            <Select
              showSearch optionFilterProp="label" allowClear disabled={readOnly}
              placeholder={isSupplier ? 'Map to supplier (optional)' : 'Map to customer (optional)'}
              options={(isSupplier ? suppliers : customers).map((s: any) => ({ value: s.id, label: s.name }))}
              onChange={v => { if (isSupplier) setSelectedSupplierId(v); else setSelectedCustomerId(v) }}
            />
          </Form.Item>
        </Col>
        <Col span={10}>
          <Form.Item label="Date" name={isSupplier ? 'paymentDate' : 'receiptDate'} rules={[{ required: true }]}>
            <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" disabled={readOnly} />
          </Form.Item>
        </Col>
      </Row>

      {isSupplier && spLedger && (
        <div style={{ background: spLedger.outstanding > 0 ? '#fff7f7' : '#f6fbf6', border: `1px solid ${spLedger.outstanding > 0 ? '#ffccc7' : '#c8e6c9'}`, borderRadius: 8, padding: '6px 12px', marginBottom: 10, fontSize: 12, display: 'flex', gap: 16 }}>
          <span style={{ color: '#888' }}>Purchase: <b style={{ color: '#1a1a1a' }}>{formatINR(spLedger.totalPurchase)}</b></span>
          <span style={{ color: '#888' }}>Paid: <b style={{ color: '#2e7d32' }}>{formatINR(spLedger.totalPaid)}</b></span>
          <span style={{ color: '#888' }}>Outstanding: <b style={{ color: spLedger.outstanding > 0 ? '#cf1322' : '#2e7d32' }}>{formatINR(spLedger.outstanding)}</b></span>
        </div>
      )}
      {!isSupplier && crLedger && (
        <div style={{ background: crLedger.outstanding > 0 ? '#f6fbf6' : '#fff7f7', border: `1px solid ${crLedger.outstanding > 0 ? '#c8e6c9' : '#ffccc7'}`, borderRadius: 8, padding: '6px 12px', marginBottom: 10, fontSize: 12, display: 'flex', gap: 16 }}>
          <span style={{ color: '#888' }}>Sale: <b style={{ color: '#1a1a1a' }}>{formatINR(crLedger.totalSale)}</b></span>
          <span style={{ color: '#888' }}>Received: <b style={{ color: '#2e7d32' }}>{formatINR(crLedger.totalReceived)}</b></span>
          <span style={{ color: '#888' }}>Outstanding: <b style={{ color: crLedger.outstanding > 0 ? '#2e7d32' : '#cf1322' }}>{formatINR(crLedger.outstanding)}</b></span>
        </div>
      )}
      {isSupplier && selectedSupplier?.bankName && (
        <div style={{ background: '#f6fbf6', border: '1px solid #c8e6c9', borderRadius: 8, padding: '8px 12px', marginBottom: 12, fontSize: 12 }}>
          <BankOutlined style={{ color: '#2e7d32', marginRight: 6 }} />
          <b>{selectedSupplier.bankName}</b>
          {selectedSupplier.bankAccount && <span style={{ color: '#555', marginLeft: 8 }}>A/C: {selectedSupplier.bankAccount}</span>}
          {(selectedSupplier.ifscCode || selectedSupplier.bankIfsc) && <span style={{ color: '#555', marginLeft: 8 }}>IFSC: {selectedSupplier.ifscCode || selectedSupplier.bankIfsc}</span>}
        </div>
      )}

      <Row gutter={12}>
        <Col span={12}>
          <Form.Item label="Amount (₹)" name="amount" rules={[{ required: true }]}>
            <InputNumber min={0} style={{ width: '100%' }} step={100} disabled={readOnly}
              formatter={v => `₹ ${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
              parser={v => v!.replace(/₹\s?|(,*)/g, '') as any} />
          </Form.Item>
        </Col>
        <Col span={12}>
          <Form.Item label="Payment Mode" name="paymentMode" rules={[{ required: true }]}>
            <Select options={PAYMENT_MODES} disabled={readOnly} />
          </Form.Item>
        </Col>
      </Row>
      <Row gutter={12}>
        <Col span={12}>
          <Form.Item label="Paid To (raw)" name="paidTo">
            <Input placeholder="Beneficiary name from bank" disabled={readOnly} />
          </Form.Item>
        </Col>
        <Col span={12}>
          <Form.Item label="Account / VPA" name="accountRef">
            <Input placeholder="A/C number or UPI VPA" disabled={readOnly} />
          </Form.Item>
        </Col>
      </Row>
      <Form.Item label="Reference / UTR / Cheque No." name="referenceNumber">
        <Input placeholder="e.g. UTR123456789" disabled={readOnly} />
      </Form.Item>
      <Form.Item label="Notes" name="notes">
        <Input.TextArea rows={2} placeholder="Optional remarks" disabled={readOnly} />
      </Form.Item>
    </>
  )
}

function BulkEditModal({
  open, onClose, onApply, type, suppliers, customers, count,
}: {
  open: boolean
  onClose: () => void
  onApply: (patch: Record<string, unknown>) => Promise<void>
  type: 'supplier' | 'customer'
  suppliers: any[]
  customers: any[]
  count: number
}) {
  const [form] = Form.useForm()
  const [fields, setFields] = useState<string[]>([])
  const isSupplier = type === 'supplier'

  const apply = async () => {
    const values = await form.validateFields()
    const patch: Record<string, unknown> = {}
    for (const f of fields) {
      if (f === 'date') {
        const key = isSupplier ? 'paymentDate' : 'receiptDate'
        patch[key] = values.date?.format('YYYY-MM-DD')
      } else if (f === 'mapping') {
        patch[isSupplier ? 'supplierId' : 'customerId'] = values.mappingId ?? null
      } else if (f === 'mode') {
        patch.paymentMode = values.paymentMode
      } else if (f === 'notes') {
        patch.notes = values.notes ?? ''
      }
    }
    if (!Object.keys(patch).length) {
      message.warning('Pick at least one field to update')
      return
    }
    await onApply(patch)
    form.resetFields()
    setFields([])
  }

  const close = () => { form.resetFields(); setFields([]); onClose() }

  return (
    <Modal
      title={<Space><EditOutlined />Bulk edit {count} {isSupplier ? 'payment(s)' : 'receipt(s)'}</Space>}
      open={open}
      onOk={apply}
      onCancel={close}
      width={520}
      okText="Apply to selected"
      destroyOnClose
    >
      <div style={{ marginBottom: 12, fontSize: 12, color: '#888' }}>
        Choose which fields to overwrite. Unchecked fields stay untouched.
      </div>
      <Select
        mode="multiple"
        style={{ width: '100%', marginBottom: 16 }}
        placeholder="Fields to update"
        value={fields}
        onChange={setFields}
        options={[
          { value: 'mapping', label: isSupplier ? 'Map to Supplier' : 'Map to Customer' },
          { value: 'date', label: 'Date' },
          { value: 'mode', label: 'Payment Mode' },
          { value: 'notes', label: 'Notes' },
        ]}
      />
      <Form form={form} layout="vertical" size="small">
        {fields.includes('mapping') && (
          <Form.Item label={isSupplier ? 'Supplier' : 'Customer'} name="mappingId">
            <Select
              showSearch allowClear optionFilterProp="label"
              placeholder="Pick one (or clear to unmap)"
              options={(isSupplier ? suppliers : customers).map((s: any) => ({ value: s.id, label: s.name }))}
            />
          </Form.Item>
        )}
        {fields.includes('date') && (
          <Form.Item label="Date" name="date" rules={[{ required: true }]}>
            <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
          </Form.Item>
        )}
        {fields.includes('mode') && (
          <Form.Item label="Payment Mode" name="paymentMode" rules={[{ required: true }]}>
            <Select options={PAYMENT_MODES} />
          </Form.Item>
        )}
        {fields.includes('notes') && (
          <Form.Item label="Notes" name="notes">
            <Input.TextArea rows={2} placeholder="Replace existing notes" />
          </Form.Item>
        )}
      </Form>
    </Modal>
  )
}

export default function PaymentsPage() {
  const [supplierModal, setSupplierModal] = useState<{ open: boolean; mode: ModalMode; record?: any }>({ open: false, mode: 'create' })
  const [customerModal, setCustomerModal] = useState<{ open: boolean; mode: ModalMode; record?: any }>({ open: false, mode: 'create' })
  const [selectedSupplier, setSelectedSupplier] = useState<string>('')
  const [selectedCustomer, setSelectedCustomer] = useState<string>('')
  const [spSelectedIds, setSpSelectedIds] = useState<React.Key[]>([])
  const [crSelectedIds, setCrSelectedIds] = useState<React.Key[]>([])
  const [spBulkOpen, setSpBulkOpen] = useState(false)
  const [crBulkOpen, setCrBulkOpen] = useState(false)
  const [spForm] = Form.useForm()
  const [crForm] = Form.useForm()

  const { data: suppliers = [] } = useSuppliers()
  const { data: customers = [] } = useCustomers()
  const { data: spayments = [], isLoading: spLoading } = useSupplierPayments(selectedSupplier || undefined)
  const { data: receipts = [], isLoading: crLoading } = useCustomerReceipts(selectedCustomer || undefined)
  const { mutateAsync: createSP } = useCreateSupplierPayment()
  const { mutateAsync: updateSP } = useUpdateSupplierPayment()
  const { mutateAsync: deleteSP } = useDeleteSupplierPayment()
  const { mutateAsync: bulkUpdateSP } = useBulkUpdateSupplierPayments()
  const { mutateAsync: bulkDeleteSP } = useBulkDeleteSupplierPayments()
  const { mutateAsync: createCR } = useCreateCustomerReceipt()
  const { mutateAsync: updateCR } = useUpdateCustomerReceipt()
  const { mutateAsync: deleteCR } = useDeleteCustomerReceipt()
  const { mutateAsync: bulkUpdateCR } = useBulkUpdateCustomerReceipts()
  const { mutateAsync: bulkDeleteCR } = useBulkDeleteCustomerReceipts()

  const openSpCreate = () => { spForm.resetFields(); spForm.setFieldsValue({ paymentDate: dayjs() }); setSupplierModal({ open: true, mode: 'create' }) }
  const openSpEdit = (rec: any) => {
    spForm.resetFields()
    spForm.setFieldsValue({ ...rec, paymentDate: rec.paymentDate ? dayjs(rec.paymentDate) : null })
    setSupplierModal({ open: true, mode: 'edit', record: rec })
  }
  const openSpView = (rec: any) => {
    spForm.resetFields()
    spForm.setFieldsValue({ ...rec, paymentDate: rec.paymentDate ? dayjs(rec.paymentDate) : null })
    setSupplierModal({ open: true, mode: 'view', record: rec })
  }
  const openCrCreate = () => { crForm.resetFields(); crForm.setFieldsValue({ receiptDate: dayjs() }); setCustomerModal({ open: true, mode: 'create' }) }
  const openCrEdit = (rec: any) => {
    crForm.resetFields()
    crForm.setFieldsValue({ ...rec, receiptDate: rec.receiptDate ? dayjs(rec.receiptDate) : null })
    setCustomerModal({ open: true, mode: 'edit', record: rec })
  }
  const openCrView = (rec: any) => {
    crForm.resetFields()
    crForm.setFieldsValue({ ...rec, receiptDate: rec.receiptDate ? dayjs(rec.receiptDate) : null })
    setCustomerModal({ open: true, mode: 'view', record: rec })
  }

  async function saveSP() {
    const values = await spForm.validateFields()
    const payload = {
      ...values,
      paymentDate: values.paymentDate.format('YYYY-MM-DD'),
      supplierId: values.supplierId || null,
    }
    try {
      if (supplierModal.mode === 'edit' && supplierModal.record) {
        await updateSP({ id: supplierModal.record.id, ...payload })
        message.success('Payment updated')
      } else {
        await createSP(payload)
        message.success('Payment recorded')
      }
      setSupplierModal({ open: false, mode: 'create' })
      spForm.resetFields()
    } catch { message.error('Error saving payment') }
  }

  async function saveCR() {
    const values = await crForm.validateFields()
    const payload = {
      ...values,
      receiptDate: values.receiptDate.format('YYYY-MM-DD'),
      customerId: values.customerId || null,
    }
    try {
      if (customerModal.mode === 'edit' && customerModal.record) {
        await updateCR({ id: customerModal.record.id, ...payload })
        message.success('Receipt updated')
      } else {
        await createCR(payload)
        message.success('Receipt recorded')
      }
      setCustomerModal({ open: false, mode: 'create' })
      crForm.resetFields()
    } catch { message.error('Error saving receipt') }
  }

  const handleDeleteSP = async (id: string) => {
    try { await deleteSP(id); message.success('Payment deleted') }
    catch { message.error('Error deleting payment') }
  }
  const handleDeleteCR = async (id: string) => {
    try { await deleteCR(id); message.success('Receipt deleted') }
    catch { message.error('Error deleting receipt') }
  }

  const handleBulkDeleteSP = async (ids: React.Key[]) => {
    try {
      const res = await bulkDeleteSP(ids as string[])
      message.success(`Deleted ${res.deleted ?? ids.length} payment(s)`)
      setSpSelectedIds([])
    } catch { message.error('Bulk delete failed') }
  }
  const handleBulkDeleteCR = async (ids: React.Key[]) => {
    try {
      const res = await bulkDeleteCR(ids as string[])
      message.success(`Deleted ${res.deleted ?? ids.length} receipt(s)`)
      setCrSelectedIds([])
    } catch { message.error('Bulk delete failed') }
  }

  const handleBulkUpdateSP = async (patch: Record<string, unknown>) => {
    try {
      const res = await bulkUpdateSP({ ids: spSelectedIds as string[], patch })
      message.success(`Updated ${res.updated ?? spSelectedIds.length} payment(s)`)
      setSpBulkOpen(false)
      setSpSelectedIds([])
    } catch { message.error('Bulk update failed') }
  }
  const handleBulkUpdateCR = async (patch: Record<string, unknown>) => {
    try {
      const res = await bulkUpdateCR({ ids: crSelectedIds as string[], patch })
      message.success(`Updated ${res.updated ?? crSelectedIds.length} receipt(s)`)
      setCrBulkOpen(false)
      setCrSelectedIds([])
    } catch { message.error('Bulk update failed') }
  }

  const spVisibleIds = useMemo(() => spayments.map((r: any) => r.id), [spayments])
  const crVisibleIds = useMemo(() => receipts.map((r: any) => r.id), [receipts])

  const spColumns = [
    { title: 'Payment No.', dataIndex: 'paymentNumber', key: 'no', width: 130, render: (v: string) => <b style={{ color: '#1677ff' }}>{v}</b> },
    { title: 'Date', dataIndex: 'paymentDate', key: 'date', width: 100, render: (v: string) => dayjs(v).format('DD/MM/YYYY') },
    {
      title: 'Supplier / Paid To',
      key: 'supplier',
      render: (_: any, r: any) =>
        r.supplier?.name ?? (
          r.paidTo
            ? <span><Tooltip title="Unmapped — click edit to assign supplier"><ExclamationCircleFilled style={{ color: '#faad14', marginRight: 6 }} /></Tooltip>{r.paidTo}</span>
            : <span style={{ color: '#ccc' }}>-</span>
        ),
    },
    { title: 'Amount', dataIndex: 'amount', key: 'amount', align: 'right' as const, width: 120, render: (v: number) => <b style={{ color: '#cf1322' }}>{formatINR(v)}</b> },
    { title: 'Mode', dataIndex: 'paymentMode', key: 'mode', width: 90, render: (v: string) => <Tag color={modeColor[v] ?? 'default'}>{v}</Tag> },
    { title: 'Reference', dataIndex: 'referenceNumber', key: 'ref', ellipsis: true, render: (v: string) => v || <span style={{ color: '#ccc' }}>-</span> },
    { title: 'Notes', dataIndex: 'notes', key: 'notes', ellipsis: true, render: (v: string) => v || <span style={{ color: '#ccc' }}>-</span> },
    {
      title: 'Actions', key: 'actions', width: 130, fixed: 'right' as const,
      render: (_: any, rec: any) => (
        <Space size={4}>
          <Tooltip title="View"><Button size="small" type="text" icon={<EyeOutlined />} onClick={() => openSpView(rec)} /></Tooltip>
          <Tooltip title="Edit"><Button size="small" type="text" icon={<EditOutlined />} onClick={() => openSpEdit(rec)} /></Tooltip>
          <Popconfirm title="Delete this payment?" description="This cannot be undone." okText="Delete" okButtonProps={{ danger: true }} onConfirm={() => handleDeleteSP(rec.id)}>
            <Tooltip title="Delete"><Button size="small" type="text" danger icon={<DeleteOutlined />} /></Tooltip>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  const crColumns = [
    { title: 'Receipt No.', dataIndex: 'receiptNumber', key: 'no', width: 130, render: (v: string) => <b style={{ color: '#1677ff' }}>{v}</b> },
    { title: 'Date', dataIndex: 'receiptDate', key: 'date', width: 100, render: (v: string) => dayjs(v).format('DD/MM/YYYY') },
    {
      title: 'Customer / Paid By',
      key: 'customer',
      render: (_: any, r: any) =>
        r.customer?.name ?? (
          r.paidTo
            ? <span><Tooltip title="Unmapped — click edit to assign customer"><ExclamationCircleFilled style={{ color: '#faad14', marginRight: 6 }} /></Tooltip>{r.paidTo}</span>
            : <span style={{ color: '#ccc' }}>-</span>
        ),
    },
    { title: 'Amount', dataIndex: 'amount', key: 'amount', align: 'right' as const, width: 120, render: (v: number) => <b style={{ color: '#2e7d32' }}>{formatINR(v)}</b> },
    { title: 'Mode', dataIndex: 'paymentMode', key: 'mode', width: 90, render: (v: string) => <Tag color={modeColor[v] ?? 'default'}>{v}</Tag> },
    { title: 'Reference', dataIndex: 'referenceNumber', key: 'ref', ellipsis: true, render: (v: string) => v || <span style={{ color: '#ccc' }}>-</span> },
    { title: 'Notes', dataIndex: 'notes', key: 'notes', ellipsis: true, render: (v: string) => v || <span style={{ color: '#ccc' }}>-</span> },
    {
      title: 'Actions', key: 'actions', width: 130, fixed: 'right' as const,
      render: (_: any, rec: any) => (
        <Space size={4}>
          <Tooltip title="View"><Button size="small" type="text" icon={<EyeOutlined />} onClick={() => openCrView(rec)} /></Tooltip>
          <Tooltip title="Edit"><Button size="small" type="text" icon={<EditOutlined />} onClick={() => openCrEdit(rec)} /></Tooltip>
          <Popconfirm title="Delete this receipt?" description="This cannot be undone." okText="Delete" okButtonProps={{ danger: true }} onConfirm={() => handleDeleteCR(rec.id)}>
            <Tooltip title="Delete"><Button size="small" type="text" danger icon={<DeleteOutlined />} /></Tooltip>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  const spBulkBar = spSelectedIds.length > 0 && (
    <div style={{ background: '#f0f7ff', border: '1px solid #91caff', borderRadius: 8, padding: '8px 14px', marginBottom: 12, display: 'flex', gap: 12, alignItems: 'center' }}>
      <b>{spSelectedIds.length}</b> selected
      <Button size="small" onClick={() => setSpSelectedIds(spVisibleIds)}>Select all visible ({spVisibleIds.length})</Button>
      <Button size="small" onClick={() => setSpSelectedIds([])}>Clear</Button>
      <div style={{ flex: 1 }} />
      <Button size="small" icon={<EditOutlined />} onClick={() => setSpBulkOpen(true)}>Bulk edit</Button>
      <Popconfirm title={`Delete ${spSelectedIds.length} payment(s)?`} description="This cannot be undone." okText="Delete" okButtonProps={{ danger: true }} onConfirm={() => handleBulkDeleteSP(spSelectedIds)}>
        <Button size="small" danger icon={<DeleteOutlined />}>Delete selected</Button>
      </Popconfirm>
    </div>
  )

  const crBulkBar = crSelectedIds.length > 0 && (
    <div style={{ background: '#f6ffed', border: '1px solid #b7eb8f', borderRadius: 8, padding: '8px 14px', marginBottom: 12, display: 'flex', gap: 12, alignItems: 'center' }}>
      <b>{crSelectedIds.length}</b> selected
      <Button size="small" onClick={() => setCrSelectedIds(crVisibleIds)}>Select all visible ({crVisibleIds.length})</Button>
      <Button size="small" onClick={() => setCrSelectedIds([])}>Clear</Button>
      <div style={{ flex: 1 }} />
      <Button size="small" icon={<EditOutlined />} onClick={() => setCrBulkOpen(true)}>Bulk edit</Button>
      <Popconfirm title={`Delete ${crSelectedIds.length} receipt(s)?`} description="This cannot be undone." okText="Delete" okButtonProps={{ danger: true }} onConfirm={() => handleBulkDeleteCR(crSelectedIds)}>
        <Button size="small" danger icon={<DeleteOutlined />}>Delete selected</Button>
      </Popconfirm>
    </div>
  )

  return (
    <div>
      <div className="page-header">
        <div>
          <Typography.Title level={4} className="page-title">Payments & Receipts</Typography.Title>
          <div className="page-subtitle">Record supplier payments and customer receipts</div>
        </div>
      </div>

      <Tabs
        items={[
          {
            key: 'payable',
            label: <Space><ArrowDownOutlined style={{ color: '#cf1322' }} />Supplier Payments</Space>,
            children: (
              <div>
                <div style={{ display: 'flex', gap: 12, marginBottom: 14, alignItems: 'center' }}>
                  <Select
                    placeholder="Filter by supplier" style={{ width: 260 }} allowClear showSearch
                    optionFilterProp="label"
                    options={suppliers.map((s: any) => ({ value: s.id, label: s.name }))}
                    onChange={v => setSelectedSupplier(v || '')}
                  />
                  <Button type="primary" icon={<PlusOutlined />} onClick={openSpCreate}>
                    Record Payment
                  </Button>
                  <ImportBankStatement onDone={() => {}} />
                </div>
                {selectedSupplier && <LedgerSummary type="supplier" id={selectedSupplier} />}
                {spBulkBar}
                {spayments.length === 0 && !spLoading
                  ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={selectedSupplier ? 'No payments recorded for this supplier' : 'Select a supplier to view payments, or record a new payment'} style={{ padding: '40px 0' }} />
                  : (
                    <Table
                      dataSource={spayments}
                      columns={spColumns}
                      rowKey="id"
                      loading={spLoading}
                      size="small"
                      scroll={{ x: 1100 }}
                      rowSelection={{
                        selectedRowKeys: spSelectedIds,
                        onChange: setSpSelectedIds,
                        preserveSelectedRowKeys: true,
                      }}
                      pagination={{ pageSize: 20, showTotal: t => `${t} payments` }}
                    />
                  )
                }
              </div>
            ),
          },
          {
            key: 'receivable',
            label: <Space><ArrowUpOutlined style={{ color: '#2e7d32' }} />Customer Receipts</Space>,
            children: (
              <div>
                <div style={{ display: 'flex', gap: 12, marginBottom: 14, alignItems: 'center' }}>
                  <Select
                    placeholder="Filter by customer" style={{ width: 260 }} allowClear showSearch
                    optionFilterProp="label"
                    options={customers.map((c: any) => ({ value: c.id, label: c.name }))}
                    onChange={v => setSelectedCustomer(v || '')}
                  />
                  <Button type="primary" icon={<PlusOutlined />} onClick={openCrCreate}>
                    Record Receipt
                  </Button>
                </div>
                {selectedCustomer && <LedgerSummary type="customer" id={selectedCustomer} />}
                {crBulkBar}
                {receipts.length === 0 && !crLoading
                  ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={selectedCustomer ? 'No receipts recorded for this customer' : 'Select a customer to view receipts, or record a new receipt'} style={{ padding: '40px 0' }} />
                  : (
                    <Table
                      dataSource={receipts}
                      columns={crColumns}
                      rowKey="id"
                      loading={crLoading}
                      size="small"
                      scroll={{ x: 1100 }}
                      rowSelection={{
                        selectedRowKeys: crSelectedIds,
                        onChange: setCrSelectedIds,
                        preserveSelectedRowKeys: true,
                      }}
                      pagination={{ pageSize: 20, showTotal: t => `${t} receipts` }}
                    />
                  )
                }
              </div>
            ),
          },
        ]}
      />

      <Modal
        title={<Space><ArrowDownOutlined style={{ color: '#cf1322' }} />
          {supplierModal.mode === 'create' ? 'Record Supplier Payment'
            : supplierModal.mode === 'edit' ? `Edit ${supplierModal.record?.paymentNumber ?? 'Payment'}`
            : `View ${supplierModal.record?.paymentNumber ?? 'Payment'}`}
        </Space>}
        open={supplierModal.open}
        onOk={supplierModal.mode === 'view' ? () => setSupplierModal({ open: false, mode: 'create' }) : saveSP}
        onCancel={() => setSupplierModal({ open: false, mode: 'create' })}
        width={520}
        okText={supplierModal.mode === 'create' ? 'Record Payment' : supplierModal.mode === 'edit' ? 'Save Changes' : 'Close'}
        cancelButtonProps={{ style: supplierModal.mode === 'view' ? { display: 'none' } : {} }}
        destroyOnClose
      >
        <Form form={spForm} layout="vertical" size="small" style={{ marginTop: 12 }}>
          <PaymentForm type="supplier" suppliers={suppliers} customers={customers} readOnly={supplierModal.mode === 'view'} />
        </Form>
      </Modal>

      <Modal
        title={<Space><ArrowUpOutlined style={{ color: '#2e7d32' }} />
          {customerModal.mode === 'create' ? 'Record Customer Receipt'
            : customerModal.mode === 'edit' ? `Edit ${customerModal.record?.receiptNumber ?? 'Receipt'}`
            : `View ${customerModal.record?.receiptNumber ?? 'Receipt'}`}
        </Space>}
        open={customerModal.open}
        onOk={customerModal.mode === 'view' ? () => setCustomerModal({ open: false, mode: 'create' }) : saveCR}
        onCancel={() => setCustomerModal({ open: false, mode: 'create' })}
        width={520}
        okText={customerModal.mode === 'create' ? 'Record Receipt' : customerModal.mode === 'edit' ? 'Save Changes' : 'Close'}
        cancelButtonProps={{ style: customerModal.mode === 'view' ? { display: 'none' } : {} }}
        destroyOnClose
      >
        <Form form={crForm} layout="vertical" size="small" style={{ marginTop: 12 }}>
          <PaymentForm type="customer" suppliers={suppliers} customers={customers} readOnly={customerModal.mode === 'view'} />
        </Form>
      </Modal>

      <BulkEditModal
        open={spBulkOpen}
        onClose={() => setSpBulkOpen(false)}
        onApply={handleBulkUpdateSP}
        type="supplier"
        suppliers={suppliers}
        customers={customers}
        count={spSelectedIds.length}
      />
      <BulkEditModal
        open={crBulkOpen}
        onClose={() => setCrBulkOpen(false)}
        onApply={handleBulkUpdateCR}
        type="customer"
        suppliers={suppliers}
        customers={customers}
        count={crSelectedIds.length}
      />
    </div>
  )
}
