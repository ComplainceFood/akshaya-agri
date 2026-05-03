import { useState } from 'react'
import {
  Tabs, Table, Typography, DatePicker, Card, Statistic, Row, Col,
  Select, Space, Tag, Progress, Divider
} from 'antd'
import {
  ArrowDownOutlined, ArrowUpOutlined, TeamOutlined, UserOutlined,
  CarOutlined, DollarOutlined, BarChartOutlined,
} from '@ant-design/icons'
import { usePnL, useSupplierReport, useCustomerReport, usePaymentsReport, useStockReport, useSuppliers, useCustomers, useCommodities } from '../../api/hooks'
import { formatINR, formatQt } from '../../utils/format'
import dayjs from 'dayjs'

const { RangePicker } = DatePicker

function SummaryCard({ title, value, color, prefix, sub }: { title: string; value: string; color?: string; prefix?: React.ReactNode; sub?: string }) {
  return (
    <Card size="small" style={{ height: '100%' }}>
      <Statistic title={title} value={value} prefix={prefix} valueStyle={{ color: color ?? '#000', fontSize: 17 }} />
      {sub && <div style={{ color: '#888', fontSize: 11, marginTop: 2 }}>{sub}</div>}
    </Card>
  )
}

function DateFilter({ onChange }: { onChange: (from: string | null, to: string | null) => void }) {
  return (
    <RangePicker
      format="DD/MM/YYYY"
      style={{ width: 240 }}
      onChange={(_, s) => onChange(s[0] || null, s[1] || null)}
      allowClear
    />
  )
}

// ── P&L Tab ─────────────────────────────────────────────────────────────────
function PnLTab() {
  const [from, setFrom] = useState<string | null>(null)
  const [to, setTo] = useState<string | null>(null)
  const [commodityId, setCommodityId] = useState<string | null>(null)
  const { data: commodities = [] } = useCommodities()
  const { data: pnl, isLoading } = usePnL(
    from || to || commodityId ? { from, to, commodityId } : undefined
  )

  const marginPct = pnl?.totalSale > 0 ? (pnl.totalMargin / pnl.totalSale) * 100 : 0

  const columns = [
    { title: 'LR / Slip No.', key: 'lr', render: (_: any, r: any) => r.lrNumber || r.deliveryNumber },
    { title: 'Date', dataIndex: 'deliveryDate', key: 'date', render: (v: string) => dayjs(v).format('DD/MM/YYYY') },
    { title: 'Supplier', dataIndex: ['supplier', 'name'], key: 'supplier', ellipsis: true },
    { title: 'Customer', dataIndex: ['customer', 'name'], key: 'customer', ellipsis: true },
    { title: 'Commodity', dataIndex: ['commodity', 'name'], key: 'commodity' },
    { title: 'Weight (Qt)', dataIndex: 'adjustedWeight', key: 'wt', render: formatQt },
    { title: 'Buy Rate', dataIndex: 'purchaseRate', key: 'br', render: (v: number) => v ? `₹${Number(v).toLocaleString('en-IN', { maximumFractionDigits: 2 })}` : '-' },
    { title: 'Sell Rate', dataIndex: 'saleRate', key: 'sr', render: (v: number) => v ? `₹${Number(v).toLocaleString('en-IN', { maximumFractionDigits: 2 })}` : '-' },
    { title: 'Purchase Value', dataIndex: 'purchaseValue', key: 'pv', render: (v: number) => formatINR(v) },
    { title: 'Sale Value', dataIndex: 'saleValue', key: 'sv', render: (v: number) => v ? formatINR(v) : '-' },
    { title: 'Net Payable', dataIndex: 'netPayable', key: 'np', render: (v: number) => v ? <b style={{ color: '#1677ff' }}>{formatINR(v)}</b> : '-' },
    {
      title: 'Margin', dataIndex: 'grossMargin', key: 'margin',
      render: (v: number) => v != null ? <span style={{ color: v >= 0 ? '#2e7d32' : '#cf1322', fontWeight: 600 }}>{formatINR(v)}</span> : '-'
    },
  ]

  return (
    <div>
      <Space wrap style={{ marginBottom: 16 }}>
        <DateFilter onChange={(f, t) => { setFrom(f); setTo(t) }} />
        <Select placeholder="Filter Commodity" allowClear showSearch optionFilterProp="label" style={{ width: 180 }}
          options={commodities.map((c: any) => ({ value: c.id, label: c.name }))}
          onChange={v => setCommodityId(v ?? null)} />
      </Space>
      {pnl && (
        <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
          <Col xs={12} sm={6}><SummaryCard title="Total Weight" value={formatQt(pnl.totalWeight ?? 0)} prefix={<CarOutlined />} /></Col>
          <Col xs={12} sm={6}><SummaryCard title="Purchase Value" value={formatINR(pnl.totalPurchase)} /></Col>
          <Col xs={12} sm={6}><SummaryCard title="Sale Value" value={formatINR(pnl.totalSale)} color="#2e7d32" /></Col>
          <Col xs={12} sm={6}>
            <Card size="small">
              <Statistic title="Gross Margin" value={formatINR(pnl.totalMargin)}
                valueStyle={{ color: pnl.totalMargin >= 0 ? '#2e7d32' : '#cf1322', fontSize: 17 }} />
              {pnl.totalSale > 0 && (
                <Progress percent={+marginPct.toFixed(1)} size="small"
                  strokeColor={marginPct >= 0 ? '#2e7d32' : '#cf1322'}
                  format={p => `${p}%`} style={{ marginTop: 4 }} />
              )}
            </Card>
          </Col>
        </Row>
      )}
      <Table dataSource={pnl?.deliveries || []} columns={columns} rowKey="id"
        loading={isLoading} size="small" scroll={{ x: 1100 }}
        pagination={{ pageSize: 50, showSizeChanger: true, showTotal: t => `${t} deliveries` }} />
    </div>
  )
}

// ── Supplier Report Tab ──────────────────────────────────────────────────────
function SupplierTab() {
  const [from, setFrom] = useState<string | null>(null)
  const [to, setTo] = useState<string | null>(null)
  const [supplierId, setSupplierId] = useState<string | null>(null)
  const { data: suppliers = [] } = useSuppliers()
  const { data, isLoading } = useSupplierReport(
    from || to || supplierId ? { from, to, supplierId } : undefined
  )
  const rows: any[] = data?.rows || []
  const payments: any[] = data?.paymentHistory || []

  const totalOutstanding = rows.reduce((s, r) => s + Math.max(0, r.outstanding), 0)
  const totalPurchase = rows.reduce((s, r) => s + r.totalPurchaseValue, 0)
  const totalPaid = rows.reduce((s, r) => s + r.totalPaid, 0)

  const summaryColumns = [
    { title: 'Supplier', dataIndex: 'name', key: 'name', render: (v: string) => <b>{v}</b> },
    { title: 'Deliveries', dataIndex: 'deliveryCount', key: 'dc', align: 'right' as const },
    { title: 'Weight (Qt)', dataIndex: 'totalWeight', key: 'wt', align: 'right' as const, render: formatQt },
    { title: 'Purchase Value', dataIndex: 'totalPurchaseValue', key: 'pv', align: 'right' as const, render: (v: number) => formatINR(v) },
    { title: 'Net Payable', dataIndex: 'totalNetPayable', key: 'np', align: 'right' as const, render: (v: number) => formatINR(v) },
    { title: 'Paid', dataIndex: 'totalPaid', key: 'pd', align: 'right' as const, render: (v: number) => <span style={{ color: '#2e7d32' }}>{formatINR(v)}</span> },
    {
      title: 'Outstanding', dataIndex: 'outstanding', key: 'os', align: 'right' as const,
      render: (v: number) => <b style={{ color: v > 0 ? '#cf1322' : '#2e7d32' }}>{formatINR(v)}</b>
    },
  ]

  const paymentColumns = [
    { title: 'Receipt No.', dataIndex: 'paymentNumber', key: 'pn' },
    { title: 'Date', dataIndex: 'paymentDate', key: 'date', render: (v: string) => dayjs(v).format('DD/MM/YYYY') },
    { title: 'Supplier', dataIndex: ['supplier', 'name'], key: 'supplier' },
    { title: 'Amount', dataIndex: 'amount', key: 'amt', render: (v: number) => <b style={{ color: '#2e7d32' }}>{formatINR(v)}</b> },
    { title: 'Notes', dataIndex: 'notes', key: 'notes', ellipsis: true },
  ]

  return (
    <div>
      <Space wrap style={{ marginBottom: 16 }}>
        <DateFilter onChange={(f, t) => { setFrom(f); setTo(t) }} />
        <Select placeholder="All Suppliers" allowClear showSearch optionFilterProp="label" style={{ width: 200 }}
          options={suppliers.map((s: any) => ({ value: s.id, label: s.name }))}
          onChange={v => setSupplierId(v ?? null)} />
      </Space>

      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        <Col xs={12} sm={8}><SummaryCard title="Total Purchase Value" value={formatINR(totalPurchase)} prefix={<TeamOutlined />} /></Col>
        <Col xs={12} sm={8}><SummaryCard title="Total Paid" value={formatINR(totalPaid)} color="#2e7d32" prefix={<ArrowUpOutlined />} /></Col>
        <Col xs={12} sm={8}><SummaryCard title="Total Outstanding" value={formatINR(totalOutstanding)} color="#cf1322" prefix={<ArrowDownOutlined />} /></Col>
      </Row>

      <Table dataSource={rows} columns={summaryColumns} rowKey="supplierId" loading={isLoading} size="small"
        pagination={false}
        summary={rows.length > 1 ? () => (
          <Table.Summary.Row style={{ fontWeight: 600, background: '#fafafa' }}>
            <Table.Summary.Cell index={0}>Total</Table.Summary.Cell>
            <Table.Summary.Cell index={1} align="right">{rows.reduce((s, r) => s + r.deliveryCount, 0)}</Table.Summary.Cell>
            <Table.Summary.Cell index={2} align="right">{formatQt(rows.reduce((s, r) => s + r.totalWeight, 0))}</Table.Summary.Cell>
            <Table.Summary.Cell index={3} align="right">{formatINR(totalPurchase)}</Table.Summary.Cell>
            <Table.Summary.Cell index={4} align="right">{formatINR(rows.reduce((s, r) => s + r.totalNetPayable, 0))}</Table.Summary.Cell>
            <Table.Summary.Cell index={5} align="right" style={{ color: '#2e7d32' }}>{formatINR(totalPaid)}</Table.Summary.Cell>
            <Table.Summary.Cell index={6} align="right" style={{ color: '#cf1322' }}>{formatINR(totalOutstanding)}</Table.Summary.Cell>
          </Table.Summary.Row>
        ) : undefined}
      />

      {supplierId && payments.length > 0 && (
        <>
          <Divider orientation="left" style={{ marginTop: 24 }}>Payment History</Divider>
          <Table dataSource={payments} columns={paymentColumns} rowKey="id" size="small" pagination={false} />
        </>
      )}
    </div>
  )
}

// ── Customer Report Tab ──────────────────────────────────────────────────────
function CustomerTab() {
  const [from, setFrom] = useState<string | null>(null)
  const [to, setTo] = useState<string | null>(null)
  const [customerId, setCustomerId] = useState<string | null>(null)
  const { data: customers = [] } = useCustomers()
  const { data, isLoading } = useCustomerReport(
    from || to || customerId ? { from, to, customerId } : undefined
  )
  const rows: any[] = data?.rows || []
  const receipts: any[] = data?.receiptHistory || []

  const totalOutstanding = rows.reduce((s, r) => s + Math.max(0, r.outstanding), 0)
  const totalSale = rows.reduce((s, r) => s + r.totalSaleValue, 0)
  const totalReceived = rows.reduce((s, r) => s + r.totalReceived, 0)

  const summaryColumns = [
    { title: 'Customer', dataIndex: 'name', key: 'name', render: (v: string) => <b>{v}</b> },
    { title: 'Deliveries', dataIndex: 'deliveryCount', key: 'dc', align: 'right' as const },
    { title: 'Weight (Qt)', dataIndex: 'totalWeight', key: 'wt', align: 'right' as const, render: formatQt },
    { title: 'Sale Value', dataIndex: 'totalSaleValue', key: 'sv', align: 'right' as const, render: (v: number) => formatINR(v) },
    { title: 'Margin', dataIndex: 'totalMargin', key: 'mg', align: 'right' as const, render: (v: number) => <span style={{ color: v >= 0 ? '#2e7d32' : '#cf1322' }}>{formatINR(v)}</span> },
    { title: 'Received', dataIndex: 'totalReceived', key: 'rc', align: 'right' as const, render: (v: number) => <span style={{ color: '#2e7d32' }}>{formatINR(v)}</span> },
    {
      title: 'Outstanding', dataIndex: 'outstanding', key: 'os', align: 'right' as const,
      render: (v: number) => <b style={{ color: v > 0 ? '#cf1322' : '#2e7d32' }}>{formatINR(v)}</b>
    },
  ]

  const receiptColumns = [
    { title: 'Receipt No.', dataIndex: 'receiptNumber', key: 'rn' },
    { title: 'Date', dataIndex: 'receiptDate', key: 'date', render: (v: string) => dayjs(v).format('DD/MM/YYYY') },
    { title: 'Customer', dataIndex: ['customer', 'name'], key: 'customer' },
    { title: 'Amount', dataIndex: 'amount', key: 'amt', render: (v: number) => <b style={{ color: '#2e7d32' }}>{formatINR(v)}</b> },
    { title: 'Notes', dataIndex: 'notes', key: 'notes', ellipsis: true },
  ]

  return (
    <div>
      <Space wrap style={{ marginBottom: 16 }}>
        <DateFilter onChange={(f, t) => { setFrom(f); setTo(t) }} />
        <Select placeholder="All Customers" allowClear showSearch optionFilterProp="label" style={{ width: 200 }}
          options={customers.map((c: any) => ({ value: c.id, label: c.name }))}
          onChange={v => setCustomerId(v ?? null)} />
      </Space>

      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        <Col xs={12} sm={8}><SummaryCard title="Total Sale Value" value={formatINR(totalSale)} prefix={<UserOutlined />} /></Col>
        <Col xs={12} sm={8}><SummaryCard title="Total Received" value={formatINR(totalReceived)} color="#2e7d32" prefix={<ArrowUpOutlined />} /></Col>
        <Col xs={12} sm={8}><SummaryCard title="Total Outstanding" value={formatINR(totalOutstanding)} color="#cf1322" prefix={<ArrowDownOutlined />} /></Col>
      </Row>

      <Table dataSource={rows} columns={summaryColumns} rowKey="customerId" loading={isLoading} size="small"
        pagination={false}
        summary={rows.length > 1 ? () => (
          <Table.Summary.Row style={{ fontWeight: 600, background: '#fafafa' }}>
            <Table.Summary.Cell index={0}>Total</Table.Summary.Cell>
            <Table.Summary.Cell index={1} align="right">{rows.reduce((s, r) => s + r.deliveryCount, 0)}</Table.Summary.Cell>
            <Table.Summary.Cell index={2} align="right">{formatQt(rows.reduce((s, r) => s + r.totalWeight, 0))}</Table.Summary.Cell>
            <Table.Summary.Cell index={3} align="right">{formatINR(totalSale)}</Table.Summary.Cell>
            <Table.Summary.Cell index={4} align="right" style={{ color: '#2e7d32' }}>{formatINR(rows.reduce((s, r) => s + r.totalMargin, 0))}</Table.Summary.Cell>
            <Table.Summary.Cell index={5} align="right" style={{ color: '#2e7d32' }}>{formatINR(totalReceived)}</Table.Summary.Cell>
            <Table.Summary.Cell index={6} align="right" style={{ color: '#cf1322' }}>{formatINR(totalOutstanding)}</Table.Summary.Cell>
          </Table.Summary.Row>
        ) : undefined}
      />

      {customerId && receipts.length > 0 && (
        <>
          <Divider orientation="left" style={{ marginTop: 24 }}>Receipt History</Divider>
          <Table dataSource={receipts} columns={receiptColumns} rowKey="id" size="small" pagination={false} />
        </>
      )}
    </div>
  )
}

// ── Payments Tab ─────────────────────────────────────────────────────────────
function PaymentsTab() {
  const [from, setFrom] = useState<string | null>(null)
  const [to, setTo] = useState<string | null>(null)
  const [view, setView] = useState<'payments' | 'receipts' | 'cashflow'>('cashflow')
  const { data, isLoading } = usePaymentsReport(from || to ? { from, to } : undefined)

  const payments: any[] = data?.payments || []
  const receipts: any[] = data?.receipts || []
  const cashFlow: any[] = data?.dailyCashFlow || []

  const paymentColumns = [
    { title: 'Payment No.', dataIndex: 'paymentNumber', key: 'pn' },
    { title: 'Date', dataIndex: 'paymentDate', key: 'date', render: (v: string) => dayjs(v).format('DD/MM/YYYY') },
    { title: 'Supplier', dataIndex: ['supplier', 'name'], key: 'supplier' },
    { title: 'Amount', dataIndex: 'amount', key: 'amt', render: (v: number) => <b style={{ color: '#cf1322' }}>{formatINR(v)}</b> },
    { title: 'Notes', dataIndex: 'notes', key: 'notes', ellipsis: true },
  ]

  const receiptColumns = [
    { title: 'Receipt No.', dataIndex: 'receiptNumber', key: 'rn' },
    { title: 'Date', dataIndex: 'receiptDate', key: 'date', render: (v: string) => dayjs(v).format('DD/MM/YYYY') },
    { title: 'Customer', dataIndex: ['customer', 'name'], key: 'customer' },
    { title: 'Amount', dataIndex: 'amount', key: 'amt', render: (v: number) => <b style={{ color: '#2e7d32' }}>{formatINR(v)}</b> },
    { title: 'Notes', dataIndex: 'notes', key: 'notes', ellipsis: true },
  ]

  const cashFlowColumns = [
    { title: 'Date', dataIndex: 'date', key: 'date', render: (v: string) => dayjs(v).format('DD MMM YYYY') },
    { title: 'Paid Out (Suppliers)', dataIndex: 'paid', key: 'paid', render: (v: number) => v > 0 ? <span style={{ color: '#cf1322' }}>{formatINR(v)}</span> : '-' },
    { title: 'Received (Customers)', dataIndex: 'received', key: 'received', render: (v: number) => v > 0 ? <span style={{ color: '#2e7d32' }}>{formatINR(v)}</span> : '-' },
    {
      title: 'Net', key: 'net',
      render: (_: any, r: any) => {
        const net = r.received - r.paid
        return <b style={{ color: net >= 0 ? '#2e7d32' : '#cf1322' }}>{formatINR(net)}</b>
      }
    },
  ]

  return (
    <div>
      <Space wrap style={{ marginBottom: 16 }}>
        <DateFilter onChange={(f, t) => { setFrom(f); setTo(t) }} />
      </Space>

      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        <Col xs={12} sm={6}><SummaryCard title="Supplier Payments" value={formatINR(data?.totalPaid ?? 0)} color="#cf1322" prefix={<ArrowDownOutlined />} sub={`${payments.length} transactions`} /></Col>
        <Col xs={12} sm={6}><SummaryCard title="Customer Receipts" value={formatINR(data?.totalReceived ?? 0)} color="#2e7d32" prefix={<ArrowUpOutlined />} sub={`${receipts.length} transactions`} /></Col>
        <Col xs={12} sm={6}>
          <Card size="small">
            <Statistic
              title="Net Cash Flow"
              value={formatINR(data?.netCashFlow ?? 0)}
              valueStyle={{ color: (data?.netCashFlow ?? 0) >= 0 ? '#2e7d32' : '#cf1322', fontSize: 17 }}
              prefix={(data?.netCashFlow ?? 0) >= 0 ? <ArrowUpOutlined /> : <ArrowDownOutlined />}
            />
            <div style={{ color: '#888', fontSize: 11, marginTop: 2 }}>Received − Paid</div>
          </Card>
        </Col>
        <Col xs={12} sm={6}><SummaryCard title="Active Days" value={String(cashFlow.length)} prefix={<BarChartOutlined />} /></Col>
      </Row>

      <Tabs size="small" activeKey={view} onChange={v => setView(v as any)} items={[
        {
          key: 'cashflow', label: 'Daily Cash Flow',
          children: <Table dataSource={cashFlow} columns={cashFlowColumns} rowKey="date" loading={isLoading} size="small" pagination={false} />
        },
        {
          key: 'payments', label: `Supplier Payments (${payments.length})`,
          children: <Table dataSource={payments} columns={paymentColumns} rowKey="id" loading={isLoading} size="small"
            pagination={{ pageSize: 30 }}
            summary={() => (
              <Table.Summary.Row style={{ fontWeight: 600 }}>
                <Table.Summary.Cell index={0} colSpan={3}>Total</Table.Summary.Cell>
                <Table.Summary.Cell index={1} style={{ color: '#cf1322' }}>{formatINR(data?.totalPaid ?? 0)}</Table.Summary.Cell>
                <Table.Summary.Cell index={2} />
              </Table.Summary.Row>
            )} />
        },
        {
          key: 'receipts', label: `Customer Receipts (${receipts.length})`,
          children: <Table dataSource={receipts} columns={receiptColumns} rowKey="id" loading={isLoading} size="small"
            pagination={{ pageSize: 30 }}
            summary={() => (
              <Table.Summary.Row style={{ fontWeight: 600 }}>
                <Table.Summary.Cell index={0} colSpan={3}>Total</Table.Summary.Cell>
                <Table.Summary.Cell index={1} style={{ color: '#2e7d32' }}>{formatINR(data?.totalReceived ?? 0)}</Table.Summary.Cell>
                <Table.Summary.Cell index={2} />
              </Table.Summary.Row>
            )} />
        },
      ]} />
    </div>
  )
}

// ── Commodity Stock Tab ──────────────────────────────────────────────────────
function StockTab() {
  const { data: stock = [], isLoading } = useStockReport()

  const columns = [
    { title: 'Commodity', dataIndex: 'name', key: 'name', render: (v: string) => <b>{v}</b> },
    { title: 'Total Weight (Qt)', dataIndex: 'totalWeight', key: 'wt', render: formatQt },
    { title: 'Total Purchase', dataIndex: 'totalPurchase', key: 'tp', render: (v: number) => formatINR(v) },
    { title: 'Total Sale', dataIndex: 'totalSale', key: 'ts', render: (v: number) => v ? formatINR(v) : '-' },
    {
      title: 'Margin', key: 'margin',
      render: (_: any, r: any) => {
        const m = r.totalSale - r.totalPurchase
        return r.totalSale ? <b style={{ color: m >= 0 ? '#2e7d32' : '#cf1322' }}>{formatINR(m)}</b> : '-'
      }
    },
  ]

  const totalWeight = stock.reduce((s: number, r: any) => s + r.totalWeight, 0)
  const totalPurchase = stock.reduce((s: number, r: any) => s + r.totalPurchase, 0)
  const totalSale = stock.reduce((s: number, r: any) => s + r.totalSale, 0)

  return (
    <div>
      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        <Col xs={12} sm={8}><SummaryCard title="Total Weight" value={formatQt(totalWeight)} prefix={<CarOutlined />} /></Col>
        <Col xs={12} sm={8}><SummaryCard title="Total Purchase" value={formatINR(totalPurchase)} /></Col>
        <Col xs={12} sm={8}><SummaryCard title="Total Sale" value={formatINR(totalSale)} color="#2e7d32" /></Col>
      </Row>
      <Table dataSource={stock} columns={columns} rowKey="commodityId" loading={isLoading} size="small" pagination={false}
        summary={stock.length > 1 ? () => (
          <Table.Summary.Row style={{ fontWeight: 600, background: '#fafafa' }}>
            <Table.Summary.Cell index={0}>Total</Table.Summary.Cell>
            <Table.Summary.Cell index={1}>{formatQt(totalWeight)}</Table.Summary.Cell>
            <Table.Summary.Cell index={2}>{formatINR(totalPurchase)}</Table.Summary.Cell>
            <Table.Summary.Cell index={3}>{formatINR(totalSale)}</Table.Summary.Cell>
            <Table.Summary.Cell index={4} style={{ color: (totalSale - totalPurchase) >= 0 ? '#2e7d32' : '#cf1322', fontWeight: 600 }}>
              {formatINR(totalSale - totalPurchase)}
            </Table.Summary.Cell>
          </Table.Summary.Row>
        ) : undefined}
      />
    </div>
  )
}

// ── Main Page ────────────────────────────────────────────────────────────────
export default function ReportsPage() {
  return (
    <div>
      <Typography.Title level={4} style={{ marginBottom: 16 }}>Reports</Typography.Title>
      <Tabs
        items={[
          { key: 'pnl', label: <><BarChartOutlined /> P&amp;L / Deliveries</>, children: <PnLTab /> },
          { key: 'supplier', label: <><TeamOutlined /> Supplier-wise</>, children: <SupplierTab /> },
          { key: 'customer', label: <><UserOutlined /> Customer-wise</>, children: <CustomerTab /> },
          { key: 'payments', label: <><DollarOutlined /> Payments &amp; Cash Flow</>, children: <PaymentsTab /> },
          { key: 'stock', label: <><CarOutlined /> Commodity Summary</>, children: <StockTab /> },
        ]}
      />
    </div>
  )
}
