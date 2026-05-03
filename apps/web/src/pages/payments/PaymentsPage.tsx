import { useState } from 'react'
import { Tabs, Table, Button, Modal, Form, Input, InputNumber, Select, DatePicker, Typography, message, Card, Statistic, Row, Col } from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import {
  useSupplierPayments, useCreateSupplierPayment, useSupplierLedger,
  useCustomerReceipts, useCreateCustomerReceipt, useCustomerLedger,
  useSuppliers, useCustomers,
} from '../../api/hooks'
import { formatINR } from '../../utils/format'
import dayjs from 'dayjs'

const PAYMENT_MODES = ['NEFT', 'RTGS', 'IMPS', 'CHEQUE', 'CASH'].map(v => ({ value: v, label: v }))

function SupplierLedger({ supplierId }: { supplierId: string }) {
  const { data } = useSupplierLedger(supplierId)
  if (!data) return null
  return (
    <Row gutter={12} style={{ marginTop: 12 }}>
      <Col span={8}><Card size="small"><Statistic title="Total Purchase Value" value={formatINR(data.totalPurchase)} /></Card></Col>
      <Col span={8}><Card size="small"><Statistic title="Total Paid" value={formatINR(data.totalPaid)} valueStyle={{ color: '#2e7d32' }} /></Card></Col>
      <Col span={8}><Card size="small"><Statistic title="Outstanding" value={formatINR(data.outstanding)} valueStyle={{ color: data.outstanding > 0 ? '#cf1322' : '#2e7d32' }} /></Card></Col>
    </Row>
  )
}

function CustomerLedger({ customerId }: { customerId: string }) {
  const { data } = useCustomerLedger(customerId)
  if (!data) return null
  return (
    <Row gutter={12} style={{ marginTop: 12 }}>
      <Col span={8}><Card size="small"><Statistic title="Total Sale Value" value={formatINR(data.totalSale)} /></Card></Col>
      <Col span={8}><Card size="small"><Statistic title="Total Received" value={formatINR(data.totalReceived)} valueStyle={{ color: '#2e7d32' }} /></Card></Col>
      <Col span={8}><Card size="small"><Statistic title="Outstanding" value={formatINR(data.outstanding)} valueStyle={{ color: data.outstanding > 0 ? '#cf1322' : '#2e7d32' }} /></Card></Col>
    </Row>
  )
}

function PaymentForm({ namePrefix, suppliers, customers }: { namePrefix: 'supplier' | 'customer'; suppliers: any[]; customers: any[] }) {
  const isSupplier = namePrefix === 'supplier'
  return (
    <>
      <Row gutter={12}>
        <Col span={14}>
          <Form.Item label={isSupplier ? 'Supplier' : 'Customer'} name={isSupplier ? 'supplierId' : 'customerId'} rules={[{ required: true }]}>
            <Select showSearch optionFilterProp="label"
              options={(isSupplier ? suppliers : customers).map((s: any) => ({ value: s.id, label: s.name }))} />
          </Form.Item>
        </Col>
        <Col span={10}>
          <Form.Item label="Date" name={isSupplier ? 'paymentDate' : 'receiptDate'} rules={[{ required: true }]}>
            <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
          </Form.Item>
        </Col>
      </Row>
      <Row gutter={12}>
        <Col span={12}>
          <Form.Item label="Amount (₹)" name="amount" rules={[{ required: true }]}>
            <InputNumber min={0} style={{ width: '100%' }} step={0.01} />
          </Form.Item>
        </Col>
        <Col span={12}>
          <Form.Item label="Payment Mode" name="paymentMode" rules={[{ required: true }]}>
            <Select options={PAYMENT_MODES} />
          </Form.Item>
        </Col>
      </Row>
      <Form.Item label="Reference / UTR / Cheque No." name="referenceNumber"><Input /></Form.Item>
      <Form.Item label="Notes" name="notes"><Input.TextArea rows={2} /></Form.Item>
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
    { title: 'Payment No.', dataIndex: 'paymentNumber', key: 'no', render: (v: string) => <b>{v}</b> },
    { title: 'Date', dataIndex: 'paymentDate', key: 'date', render: (v: string) => dayjs(v).format('DD/MM/YYYY') },
    { title: 'Supplier', dataIndex: ['supplier', 'name'], key: 'supplier' },
    { title: 'Amount', dataIndex: 'amount', key: 'amount', render: (v: number) => formatINR(v) },
    { title: 'Mode', dataIndex: 'paymentMode', key: 'mode' },
    { title: 'Reference', dataIndex: 'referenceNumber', key: 'ref', render: (v: string) => v || '—' },
  ]

  const crColumns = [
    { title: 'Receipt No.', dataIndex: 'receiptNumber', key: 'no', render: (v: string) => <b>{v}</b> },
    { title: 'Date', dataIndex: 'receiptDate', key: 'date', render: (v: string) => dayjs(v).format('DD/MM/YYYY') },
    { title: 'Customer', dataIndex: ['customer', 'name'], key: 'customer' },
    { title: 'Amount', dataIndex: 'amount', key: 'amount', render: (v: number) => formatINR(v) },
    { title: 'Mode', dataIndex: 'paymentMode', key: 'mode' },
    { title: 'Reference', dataIndex: 'referenceNumber', key: 'ref', render: (v: string) => v || '—' },
  ]

  return (
    <div>
      <Typography.Title level={4} style={{ marginBottom: 12 }}>Payments & Receipts</Typography.Title>
      <Tabs items={[
        {
          key: 'payable', label: 'Supplier Payments (Payable)',
          children: (
            <div>
              <div style={{ display: 'flex', gap: 12, marginBottom: 12, alignItems: 'center' }}>
                <Select placeholder="Filter by Supplier" style={{ width: 240 }} allowClear showSearch optionFilterProp="label"
                  options={suppliers.map((s: any) => ({ value: s.id, label: s.name }))}
                  onChange={v => setSelectedSupplier(v || '')} />
                <Button type="primary" icon={<PlusOutlined />} onClick={() => { spForm.resetFields(); setSupplierOpen(true) }}>
                  Record Payment
                </Button>
              </div>
              {selectedSupplier && <SupplierLedger supplierId={selectedSupplier} />}
              <Table dataSource={spayments} columns={spColumns} rowKey="id" loading={spLoading} size="small" style={{ marginTop: 12 }} />
            </div>
          )
        },
        {
          key: 'receivable', label: 'Customer Receipts (Receivable)',
          children: (
            <div>
              <div style={{ display: 'flex', gap: 12, marginBottom: 12, alignItems: 'center' }}>
                <Select placeholder="Filter by Customer" style={{ width: 240 }} allowClear showSearch optionFilterProp="label"
                  options={customers.map((c: any) => ({ value: c.id, label: c.name }))}
                  onChange={v => setSelectedCustomer(v || '')} />
                <Button type="primary" icon={<PlusOutlined />} onClick={() => { crForm.resetFields(); setCustomerOpen(true) }}>
                  Record Receipt
                </Button>
              </div>
              {selectedCustomer && <CustomerLedger customerId={selectedCustomer} />}
              <Table dataSource={receipts} columns={crColumns} rowKey="id" loading={crLoading} size="small" style={{ marginTop: 12 }} />
            </div>
          )
        }
      ]} />

      <Modal title="Record Supplier Payment" open={supplierOpen} onOk={saveSP} onCancel={() => setSupplierOpen(false)} width={460}>
        <Form form={spForm} layout="vertical" size="small"><PaymentForm namePrefix="supplier" suppliers={suppliers} customers={customers} /></Form>
      </Modal>
      <Modal title="Record Customer Receipt" open={customerOpen} onOk={saveCR} onCancel={() => setCustomerOpen(false)} width={460}>
        <Form form={crForm} layout="vertical" size="small"><PaymentForm namePrefix="customer" suppliers={suppliers} customers={customers} /></Form>
      </Modal>
    </div>
  )
}
