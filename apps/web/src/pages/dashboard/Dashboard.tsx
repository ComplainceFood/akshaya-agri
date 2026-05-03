import { Row, Col, Card, Statistic, Table, Tag, Typography, Spin, Divider, Progress } from 'antd'
import {
  ArrowUpOutlined, CarOutlined,
  TeamOutlined, UserOutlined, RiseOutlined, FallOutlined,
} from '@ant-design/icons'
import { useDashboard } from '../../api/hooks'
import { formatINR } from '../../utils/format'
import { QT_TO_KG } from '../../utils/constants'
import dayjs from 'dayjs'

const fmtKg = (qt: number) => `${(qt * QT_TO_KG).toLocaleString('en-IN', { maximumFractionDigits: 0 })} Kg`
const fmtQt = (qt: number) => `${Number(qt.toFixed(3)).toLocaleString('en-IN')} Qt`

function StatCard({ title, value, color, prefix, suffix }: { title: string; value: string; color?: string; prefix?: React.ReactNode; suffix?: string }) {
  return (
    <Card size="small" style={{ height: '100%' }}>
      <Statistic title={title} value={value} prefix={prefix} suffix={suffix}
        valueStyle={{ color: color ?? '#000', fontSize: 18 }} />
    </Card>
  )
}

export default function Dashboard() {
  const { data, isLoading } = useDashboard()

  if (isLoading) return <Spin size="large" style={{ display: 'block', margin: '60px auto' }} />
  if (!data) return null

  const recentColumns = [
    { title: 'Slip No.', dataIndex: 'lrNumber', key: 'lr', render: (v: string, r: any) => v || r.deliveryNumber },
    { title: 'Date', dataIndex: 'deliveryDate', key: 'date', render: (v: string) => dayjs(v).format('DD/MM/YY') },
    { title: 'Supplier', dataIndex: ['supplier', 'name'], key: 'supplier', ellipsis: true },
    { title: 'Vehicle', dataIndex: 'vehicleNumber', key: 'vehicle' },
    { title: 'Net Wt', dataIndex: 'adjustedWeight', key: 'wt', render: (v: number) => fmtKg(v ?? 0) },
    { title: 'Purchase Value', dataIndex: 'purchaseValue', key: 'pv', render: (v: number) => formatINR(v) },
    { title: 'Sale Value', dataIndex: 'saleValue', key: 'sv', render: (v: number) => v ? formatINR(v) : '-' },
    { title: 'Margin', key: 'margin', render: (_: any, r: any) => {
      const m = Number(r.saleValue ?? 0) - Number(r.purchaseValue ?? 0)
      return r.saleValue ? <span style={{ color: m >= 0 ? '#2e7d32' : '#cf1322' }}>{formatINR(m)}</span> : '-'
    }},
  ]

  const payableColumns = [
    { title: 'Supplier', dataIndex: 'name', key: 'name', ellipsis: true },
    { title: 'Total Purchase', dataIndex: 'totalPurchase', key: 'tp', render: (v: number) => formatINR(v) },
    { title: 'Outstanding', dataIndex: 'outstanding', key: 'os',
      render: (v: number) => <span style={{ color: '#cf1322', fontWeight: 600 }}>{formatINR(v)}</span> },
  ]

  const receivableColumns = [
    { title: 'Customer', dataIndex: 'name', key: 'name', ellipsis: true },
    { title: 'Total Sales', dataIndex: 'totalSale', key: 'ts', render: (v: number) => formatINR(v) },
    { title: 'Outstanding', dataIndex: 'outstanding', key: 'os',
      render: (v: number) => <span style={{ color: '#2e7d32', fontWeight: 600 }}>{formatINR(v)}</span> },
  ]

  const marginPct = data.thisMonth.saleValue > 0
    ? ((data.thisMonth.margin / data.thisMonth.saleValue) * 100)
    : 0

  return (
    <div>
      <Typography.Title level={4} style={{ marginBottom: 16 }}>Dashboard</Typography.Title>

      {/* ── Today ── */}
      <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 8, fontWeight: 600 }}>
        TODAY - {dayjs().format('DD MMM YYYY')}
      </Typography.Text>
      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        <Col xs={12} sm={8} lg={4}>
          <StatCard title="Deliveries" value={String(data.today.deliveryCount)} color="#1677ff" prefix={<CarOutlined />} />
        </Col>
        <Col xs={12} sm={8} lg={5}>
          <StatCard title="Weight In" value={fmtKg(data.today.totalWeightQt)} color="#1677ff" />
        </Col>
        <Col xs={12} sm={8} lg={5}>
          <StatCard title="Purchase Value" value={formatINR(data.today.purchaseValue)} />
        </Col>
        <Col xs={12} sm={8} lg={5}>
          <StatCard title="Sale Value" value={formatINR(data.today.saleValue)} color="#2e7d32" />
        </Col>
        <Col xs={12} sm={8} lg={5}>
          <StatCard title="Margin" value={formatINR(data.today.margin)}
            color={data.today.margin >= 0 ? '#2e7d32' : '#cf1322'}
            prefix={data.today.margin >= 0 ? <RiseOutlined /> : <FallOutlined />} />
        </Col>
      </Row>

      {/* ── This Month ── */}
      <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 8, fontWeight: 600 }}>
        THIS MONTH - {dayjs().format('MMM YYYY')}
      </Typography.Text>
      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        <Col xs={12} sm={8} lg={4}>
          <StatCard title="Deliveries" value={String(data.thisMonth.deliveryCount)} color="#1677ff" prefix={<CarOutlined />} />
        </Col>
        <Col xs={12} sm={8} lg={5}>
          <StatCard title="Weight In" value={fmtKg(data.thisMonth.totalWeightQt)} />
        </Col>
        <Col xs={12} sm={8} lg={5}>
          <StatCard title="Purchase Value" value={formatINR(data.thisMonth.purchaseValue)} />
        </Col>
        <Col xs={12} sm={8} lg={5}>
          <StatCard title="Sale Value" value={formatINR(data.thisMonth.saleValue)} color="#2e7d32" />
        </Col>
        <Col xs={12} sm={8} lg={5}>
          <Card size="small" style={{ height: '100%' }}>
            <Statistic title="Margin" value={formatINR(data.thisMonth.margin)}
              valueStyle={{ color: data.thisMonth.margin >= 0 ? '#2e7d32' : '#cf1322', fontSize: 18 }} />
            {data.thisMonth.saleValue > 0 && (
              <Progress percent={+marginPct.toFixed(1)} size="small" strokeColor={marginPct >= 0 ? '#2e7d32' : '#cf1322'}
                format={p => `${p}%`} style={{ marginTop: 4 }} />
            )}
          </Card>
        </Col>
      </Row>

      {/* ── Overall (All Time) ── */}
      <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 8, fontWeight: 600 }}>
        OVERALL — ALL TIME
      </Typography.Text>
      <Row gutter={[12, 12]} style={{ marginBottom: 8 }}>
        <Col xs={12} sm={8} lg={4}>
          <StatCard title="Deliveries" value={String(data.overall?.deliveryCount ?? 0)} prefix={<CarOutlined />} />
        </Col>
        <Col xs={12} sm={8} lg={5}>
          <StatCard title="Weight In" value={fmtKg(data.overall?.totalWeightQt ?? 0)} />
        </Col>
        <Col xs={12} sm={8} lg={5}>
          <StatCard title="Purchase Value" value={formatINR(data.overall?.purchaseValue ?? 0)} />
        </Col>
        <Col xs={12} sm={8} lg={5}>
          <StatCard title="Sale Value" value={formatINR(data.overall?.saleValue ?? 0)} color="#2e7d32" />
        </Col>
        <Col xs={12} sm={8} lg={5}>
          <StatCard title="Margin" value={formatINR(data.overall?.margin ?? 0)}
            color={(data.overall?.margin ?? 0) >= 0 ? '#2e7d32' : '#cf1322'}
            prefix={(data.overall?.margin ?? 0) >= 0 ? <RiseOutlined /> : <FallOutlined />} />
        </Col>
      </Row>
      <Row gutter={[12, 12]} style={{ marginBottom: 20 }}>
        <Col xs={12} sm={8}>
          <StatCard title="Total Payable (Suppliers)" value={formatINR(data.totalPayable)} color="#cf1322" prefix={<FallOutlined />} />
        </Col>
        <Col xs={12} sm={8}>
          <StatCard title="Total Receivable (Buyers)" value={formatINR(data.totalReceivable)} color="#2e7d32" prefix={<ArrowUpOutlined />} />
        </Col>
        <Col xs={12} sm={8}>
          <StatCard title="Net Position" value={formatINR(data.totalReceivable - data.totalPayable)}
            color={(data.totalReceivable - data.totalPayable) >= 0 ? '#2e7d32' : '#cf1322'}
            prefix={<ArrowUpOutlined />} />
        </Col>
      </Row>

      {/* ── Payables & Receivables breakdown ── */}
      <Row gutter={[12, 12]} style={{ marginBottom: 20 }}>
        <Col xs={24} lg={12}>
          <Card size="small" title={<><TeamOutlined /> Top Supplier Payables</>}>
            <Table dataSource={data.topSupplierPayables} columns={payableColumns}
              rowKey="supplierId" pagination={false} size="small" />
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card size="small" title={<><UserOutlined /> Top Customer Receivables</>}>
            <Table dataSource={data.topCustomerReceivables} columns={receivableColumns}
              rowKey="customerId" pagination={false} size="small" />
          </Card>
        </Col>
      </Row>

      {/* ── Recent Deliveries ── */}
      <Card size="small" title={<><CarOutlined /> Recent Deliveries (Last 10)</>}>
        <Table dataSource={data.recentDeliveries} columns={recentColumns}
          rowKey="id" pagination={false} size="small" scroll={{ x: 900 }} />
      </Card>
    </div>
  )
}
