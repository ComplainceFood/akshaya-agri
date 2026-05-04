import { useState } from 'react'
import {
  Tabs, Table, Button, Modal, Form, Input, InputNumber, Select,
  DatePicker, Typography, message, Card, Statistic, Row, Col, Tag, Empty, Space,
} from 'antd'
import { PlusOutlined, ArrowDownOutlined, ArrowUpOutlined, BankOutlined } from '@ant-design/icons'
import {
  useSupplierPayments, useCreateSupplierPayment, useSupplierLedger,
  useCustomerReceipts, useCreateCustomerReceipt, useCustomerLedger,
  useSuppliers, useCustomers,
} from '../../api/hooks'
import { formatINR } from '../../utils/format'
import dayjs from 'dayjs'

const PAYMENT_MODES = ['NEFT', 'RTGS', 'IMPS', 'CHEQUE', 'CASH'].map(v => ({ value: v, label: v }))

const modeColor: Record<string, string> = {
  NEFT: 'blue', RTGS: 'purple', IMPS: 'cyan', CHEQUE: 'orange', CASH: 'green',
}

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

function PaymentForm({ type, suppliers, customers }: { type: 'supplier' | 'customer'; suppliers: any[]; customers: any[] }) {
  const isSupplier = type === 'supplier'
  // Show bank details when a supplier is selected
  const [selectedSupplierId, setSelectedSupplierId] = useState<string | null>(null)
  const selectedSupplier = suppliers.find((s: any) => s.id === selectedSupplierId)

  return (
    <>
      <Row gutter={12}>
        <Col span={14}>
          <Form.Item label={isSupplier ? 'Supplier' : 'Customer'} name={isSupplier ? 'supplierId' : 'customerId'} rules={[{ required: true }]}>
            <Select
              showSearch optionFilterProp="label"
              options={(isSupplier ? suppliers : customers).map((s: any) => ({ value: s.id, label: s.name }))}
              onChange={v => isSupplier && setSelectedSupplierId(v)}
            />
          </Form.Item>
        </Col>
        <Col span={10}>
          <Form.Item label="Date" name={isSupplier ? 'paymentDate' : 'receiptDate'} rules={[{ required: true }]}>
            <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" defaultValue={dayjs()} />
          </Form.Item>
        </Col>
      </Row>

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
            <InputNumber min={0} style={{ width: '100%' }} step={100}
              formatter={v => `₹ ${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
              parser={v => v!.replace(/₹\s?|(,*)/g, '') as any} />
          </Form.Item>
        </Col>
        <Col span={12}>
          <Form.Item label="Payment Mode" name="paymentMode" rules={[{ required: true }]}>
            <Select options={PAYMENT_MODES} />
          </Form.Item>
        </Col>
      </Row>
      <Form.Item label="Reference / UTR / Cheque No." name="referenceNumber"><Input placeholder="e.g. UTR123456789" /></Form.Item>
      <Form.Item label="Notes" name="notes"><Input.TextArea rows={2} placeholder="Optional remarks" /></Form.Item>
    </>
  )
}

export default function PaymentsPage() {
  const [supplierOpen, setSupplierOpen] = useState(false)
  const [customerOpen, setCustomerOpen] = useState(false)
  const [selectedSupplier, setSelectedSupplier] = useState<string>('')
  const [selectedCustomer, setSelectedCustomer] = useState<string>('')
  const [spForm] = Form.useForm()
  const [crForm] = Form.useForm()

  const { data: suppliers = [] } = useSuppliers()
  const { data: customers = [] } = useCustomers()
  const { data: spayments = [], isLoading: spLoading } = useSupplierPayments(selectedSupplier || undefined)
  const { data: receipts = [], isLoading: crLoading } = useCustomerReceipts(selectedCustomer || undefined)
  const { mutateAsync: createSP } = useCreateSupplierPayment()
  const { mutateAsync: createCR } = useCreateCustomerReceipt()

  async function saveSP() {
    const values = await spForm.validateFields()
    try {
      await createSP({ ...values, paymentDate: values.paymentDate.format('YYYY-MM-DD') })
      message.success('Payment recorded')
      setSupplierOpen(false); spForm.resetFields()
    } catch { message.error('Error saving payment') }
  }

  async function saveCR() {
    const values = await crForm.validateFields()
    try {
      await createCR({ ...values, receiptDate: values.receiptDate.format('YYYY-MM-DD') })
      message.success('Receipt recorded')
      setCustomerOpen(false); crForm.resetFields()
    } catch { message.error('Error saving receipt') }
  }

  const spColumns = [
    { title: 'Payment No.', dataIndex: 'paymentNumber', key: 'no', width: 130, render: (v: string) => <b style={{ color: '#1677ff' }}>{v}</b> },
    { title: 'Date', dataIndex: 'paymentDate', key: 'date', width: 100, render: (v: string) => dayjs(v).format('DD/MM/YYYY') },
    { title: 'Supplier', dataIndex: ['supplier', 'name'], key: 'supplier' },
    { title: 'Amount', dataIndex: 'amount', key: 'amount', align: 'right' as const, render: (v: number) => <b style={{ color: '#cf1322' }}>{formatINR(v)}</b> },
    { title: 'Mode', dataIndex: 'paymentMode', key: 'mode', width: 90, render: (v: string) => <Tag color={modeColor[v] ?? 'default'}>{v}</Tag> },
    { title: 'Reference', dataIndex: 'referenceNumber', key: 'ref', render: (v: string) => v || <span style={{ color: '#ccc' }}>-</span> },
    { title: 'Notes', dataIndex: 'notes', key: 'notes', ellipsis: true, render: (v: string) => v || <span style={{ color: '#ccc' }}>-</span> },
  ]

  const crColumns = [
    { title: 'Receipt No.', dataIndex: 'receiptNumber', key: 'no', width: 130, render: (v: string) => <b style={{ color: '#1677ff' }}>{v}</b> },
    { title: 'Date', dataIndex: 'receiptDate', key: 'date', width: 100, render: (v: string) => dayjs(v).format('DD/MM/YYYY') },
    { title: 'Customer', dataIndex: ['customer', 'name'], key: 'customer' },
    { title: 'Amount', dataIndex: 'amount', key: 'amount', align: 'right' as const, render: (v: number) => <b style={{ color: '#2e7d32' }}>{formatINR(v)}</b> },
    { title: 'Mode', dataIndex: 'paymentMode', key: 'mode', width: 90, render: (v: string) => <Tag color={modeColor[v] ?? 'default'}>{v}</Tag> },
    { title: 'Reference', dataIndex: 'referenceNumber', key: 'ref', render: (v: string) => v || <span style={{ color: '#ccc' }}>-</span> },
    { title: 'Notes', dataIndex: 'notes', key: 'notes', ellipsis: true, render: (v: string) => v || <span style={{ color: '#ccc' }}>-</span> },
  ]

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
                  <Button type="primary" icon={<PlusOutlined />} onClick={() => { spForm.resetFields(); setSupplierOpen(true) }}>
                    Record Payment
                  </Button>
                </div>
                {selectedSupplier && <LedgerSummary type="supplier" id={selectedSupplier} />}
                {spayments.length === 0 && !spLoading
                  ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={selectedSupplier ? 'No payments recorded for this supplier' : 'Select a supplier to view payments, or record a new payment'} style={{ padding: '40px 0' }} />
                  : <Table dataSource={spayments} columns={spColumns} rowKey="id" loading={spLoading} size="small" pagination={{ pageSize: 20, showTotal: t => `${t} payments` }} />
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
                  <Button type="primary" icon={<PlusOutlined />} onClick={() => { crForm.resetFields(); setCustomerOpen(true) }}>
                    Record Receipt
                  </Button>
                </div>
                {selectedCustomer && <LedgerSummary type="customer" id={selectedCustomer} />}
                {receipts.length === 0 && !crLoading
                  ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={selectedCustomer ? 'No receipts recorded for this customer' : 'Select a customer to view receipts, or record a new receipt'} style={{ padding: '40px 0' }} />
                  : <Table dataSource={receipts} columns={crColumns} rowKey="id" loading={crLoading} size="small" pagination={{ pageSize: 20, showTotal: t => `${t} receipts` }} />
                }
              </div>
            ),
          },
        ]}
      />

      <Modal title={<Space><ArrowDownOutlined style={{ color: '#cf1322' }} />Record Supplier Payment</Space>}
        open={supplierOpen} onOk={saveSP} onCancel={() => setSupplierOpen(false)} width={480} okText="Record Payment">
        <Form form={spForm} layout="vertical" size="small" style={{ marginTop: 12 }}>
          <PaymentForm type="supplier" suppliers={suppliers} customers={customers} />
        </Form>
      </Modal>

      <Modal title={<Space><ArrowUpOutlined style={{ color: '#2e7d32' }} />Record Customer Receipt</Space>}
        open={customerOpen} onOk={saveCR} onCancel={() => setCustomerOpen(false)} width={480} okText="Record Receipt">
        <Form form={crForm} layout="vertical" size="small" style={{ marginTop: 12 }}>
          <PaymentForm type="customer" suppliers={suppliers} customers={customers} />
        </Form>
      </Modal>
    </div>
  )
}
