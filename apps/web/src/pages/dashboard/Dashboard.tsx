import { Row, Col, Card, Statistic, Table, Typography, Spin, Progress, Empty } from 'antd'
import {
  ArrowUpOutlined, CarOutlined, TeamOutlined, UserOutlined,
  RiseOutlined, FallOutlined, DollarOutlined, BarChartOutlined,
} from '@ant-design/icons'
import { useDashboard, usePurchaseOrders, useSalesOrders, useCommodities } from '../../api/hooks'
import { formatINR } from '../../utils/format'
import { QT_TO_KG } from '../../utils/constants'
import dayjs from 'dayjs'

const fmtKg = (qt: number) => `${(qt * QT_TO_KG).toLocaleString('en-IN', { maximumFractionDigits: 0 })} Kg`
const todayStr = dayjs().format('YYYY-MM-DD')

function StatCard({ title, value, color, prefix, suffix, sub }: {
  title: string; value: string; color?: string
  prefix?: React.ReactNode; suffix?: string; sub?: React.ReactNode
}) {
  return (
    <Card size="small" className="stat-card" style={{ height: '100%' }}>
      <Statistic title={title} value={value} prefix={prefix} suffix={suffix}
        valueStyle={{ color: color ?? '#1a1a1a', fontSize: 17, fontWeight: 700 }} />
      {sub && <div style={{ marginTop: 4, fontSize: 11, color: '#999' }}>{sub}</div>}
    </Card>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div className="section-label" style={{ marginTop: 20, marginBottom: 10 }}>{children}</div>
}

function TodayRateCard({ commodities, purchaseOrders, salesOrders }: { commodities: any[]; purchaseOrders: any[]; salesOrders: any[] }) {
  if (!commodities.length) return null

  const todayRates = commodities.map((c: any) => {
    const pr = purchaseOrders.find((p: any) => p.commodityId === c.id && p.rateDate?.split('T')[0] === todayStr)
    const sr = salesOrders.find((s: any) => s.commodityId === c.id && s.rateDate?.split('T')[0] === todayStr)
    return { ...c, purchaseRate: pr?.ratePerQuintal ?? null, saleRate: sr?.ratePerQuintal ?? null }
  }).filter((c: any) => c.purchaseRate != null || c.saleRate != null)

  if (!todayRates.length) return (
    <Card size="small" style={{ marginBottom: 16, background: '#fffbe6', border: '1px solid #ffe58f' }}>
      <Typography.Text type="warning" style={{ fontSize: 13 }}>
        ⚠ No rate card set for today ({dayjs().format('DD MMM YYYY')}) - go to Purchase Rates / Sale Rates to add today's rates.
      </Typography.Text>
    </Card>
  )

  return (
    <Row gutter={[12, 12]} style={{ marginBottom: 4 }}>
      {todayRates.map((c: any) => (
        <Col key={c.id} xs={12} sm={8} lg={6}>
          <Card size="small" className="rate-card" style={{ overflow: 'hidden' }}>
            <div className="rate-card-header">{c.name}</div>
            <div className="rate-card-body">
              <Row gutter={8}>
                {c.purchaseRate != null && (
                  <Col span={12}>
                    <div className="rate-label">Buy</div>
                    <div className="rate-value" style={{ color: '#cf1322' }}>₹{Number(c.purchaseRate).toLocaleString('en-IN')}</div>
                    <div style={{ fontSize: 10, color: '#bbb' }}>per Qt</div>
                  </Col>
                )}
                {c.saleRate != null && (
                  <Col span={12}>
                    <div className="rate-label">Sell</div>
                    <div className="rate-value" style={{ color: '#2e7d32' }}>₹{Number(c.saleRate).toLocaleString('en-IN')}</div>
                    <div style={{ fontSize: 10, color: '#bbb' }}>per Qt</div>
                  </Col>
                )}
              </Row>
            </div>
          </Card>
        </Col>
      ))}
    </Row>
  )
}

export default function Dashboard() {
  const { data, isLoading } = useDashboard()
  const { data: purchaseOrders = [] } = usePurchaseOrders()
  const { data: salesOrders = [] } = useSalesOrders()
  const { data: commodities = [] } = useCommodities()

  if (isLoading) return <Spin size="large" style={{ display: 'block', margin: '80px auto' }} />
  if (!data) return null

  const marginPct = data.thisMonth.saleValue > 0
    ? ((data.thisMonth.margin / data.thisMonth.saleValue) * 100) : 0

  const recentColumns = [
    { title: 'Slip No.', dataIndex: 'lrNumber', key: 'lr', width: 120, render: (v: string, r: any) => <b className="nowrap">{v || r.deliveryNumber}</b> },
    { title: 'Date', dataIndex: 'deliveryDate', key: 'date', width: 90, render: (v: string) => <span className="nowrap">{dayjs(v).format('DD/MM/YY')}</span> },
    { title: 'Supplier', dataIndex: ['supplier', 'name'], key: 'supplier', width: 140, ellipsis: true },
    { title: 'Commodity', dataIndex: ['commodity', 'name'], key: 'commodity', width: 110 },
    { title: 'Vehicle', dataIndex: 'vehicleNumber', key: 'vehicle', width: 110 },
    { title: 'Net Wt', dataIndex: 'adjustedWeight', key: 'wt', width: 100, render: (v: number) => <span className="nowrap">{fmtKg(v ?? 0)}</span> },
    { title: 'Purchase Value', dataIndex: 'purchaseValue', key: 'pv', width: 130, render: (v: number) => <span className="nowrap">{formatINR(v)}</span> },
    { title: 'Sale Value', dataIndex: 'saleValue', key: 'sv', width: 120, render: (v: number) => v ? <span className="nowrap">{formatINR(v)}</span> : '-' },
    {
      title: 'Margin', key: 'margin', width: 110,
      render: (_: any, r: any) => {
        const m = Number(r.saleValue ?? 0) - Number(r.purchaseValue ?? 0)
        return r.saleValue
          ? <span style={{ color: m >= 0 ? '#2e7d32' : '#cf1322', fontWeight: 600 }}>{formatINR(m)}</span>
          : '-'
      }
    },
  ]

  const payableColumns = [
    { title: 'Supplier', dataIndex: 'name', key: 'name', ellipsis: true, render: (v: string) => <b>{v}</b> },
    { title: 'Total Purchase', dataIndex: 'totalPurchase', key: 'tp', align: 'right' as const, render: (v: number) => formatINR(v) },
    {
      title: 'Outstanding', dataIndex: 'outstanding', key: 'os', align: 'right' as const,
      render: (v: number) => <span style={{ color: '#cf1322', fontWeight: 600 }}>{formatINR(v)}</span>
    },
  ]

  const receivableColumns = [
    { title: 'Customer', dataIndex: 'name', key: 'name', ellipsis: true, render: (v: string) => <b>{v}</b> },
    { title: 'Total Sales', dataIndex: 'totalSale', key: 'ts', align: 'right' as const, render: (v: number) => formatINR(v) },
    {
      title: 'Outstanding', dataIndex: 'outstanding', key: 'os', align: 'right' as const,
      render: (v: number) => <span style={{ color: '#2e7d32', fontWeight: 600 }}>{formatINR(v)}</span>
    },
  ]

  return (
    <div>
      {/* ── Header ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <Typography.Title level={4} style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>Dashboard</Typography.Title>
          <div style={{ fontSize: 12, color: '#999', marginTop: 2 }}>{dayjs().format('dddd, DD MMMM YYYY')}</div>
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          <Card size="small" style={{ background: '#fff3f3', border: '1px solid #ffcdd2', borderRadius: 8 }}>
            <Statistic title="Total Payable" value={formatINR(data.totalPayable)}
              valueStyle={{ color: '#cf1322', fontSize: 15, fontWeight: 700 }}
              prefix={<FallOutlined />} />
          </Card>
          <Card size="small" style={{ background: '#f1f8f1', border: '1px solid #c8e6c9', borderRadius: 8 }}>
            <Statistic title="Total Receivable" value={formatINR(data.totalReceivable)}
              valueStyle={{ color: '#2e7d32', fontSize: 15, fontWeight: 700 }}
              prefix={<ArrowUpOutlined />} />
          </Card>
        </div>
      </div>

      {/* ── Today's Rate Card ── */}
      <SectionLabel><BarChartOutlined /> Today's Rate Card - {dayjs().format('DD MMM YYYY')}</SectionLabel>
      <TodayRateCard commodities={commodities} purchaseOrders={purchaseOrders} salesOrders={salesOrders} />

      {/* ── Today ── */}
      <SectionLabel><CarOutlined /> Today</SectionLabel>
      <Row gutter={[12, 12]} style={{ marginBottom: 4 }}>
        <Col xs={12} sm={8} lg={4}>
          <StatCard title="Deliveries" value={String(data.today.deliveryCount)} color="#1677ff" prefix={<CarOutlined />} />
        </Col>
        <Col xs={12} sm={8} lg={5}>
          <StatCard title="Weight In" value={fmtKg(data.today.totalWeightQt)} />
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
      <SectionLabel><DollarOutlined /> {dayjs().format('MMMM YYYY')}</SectionLabel>
      <Row gutter={[12, 12]} style={{ marginBottom: 4 }}>
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
          <Card size="small" className="stat-card" style={{ height: '100%' }}>
            <Statistic title="Margin" value={formatINR(data.thisMonth.margin)}
              valueStyle={{ color: data.thisMonth.margin >= 0 ? '#2e7d32' : '#cf1322', fontSize: 17, fontWeight: 700 }} />
            {data.thisMonth.saleValue > 0 && (
              <Progress percent={+marginPct.toFixed(1)} size="small"
                strokeColor={marginPct >= 0 ? '#2e7d32' : '#cf1322'}
                format={p => `${p}%`} style={{ marginTop: 4 }} />
            )}
          </Card>
        </Col>
      </Row>

      {/* ── Overall ── */}
      <SectionLabel><BarChartOutlined /> All Time</SectionLabel>
      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        <Col xs={12} sm={8} lg={4}>
          <StatCard title="Total Deliveries" value={String(data.overall?.deliveryCount ?? 0)} prefix={<CarOutlined />} />
        </Col>
        <Col xs={12} sm={8} lg={5}>
          <StatCard title="Total Weight" value={fmtKg(data.overall?.totalWeightQt ?? 0)} />
        </Col>
        <Col xs={12} sm={8} lg={5}>
          <StatCard title="Total Purchase" value={formatINR(data.overall?.purchaseValue ?? 0)} />
        </Col>
        <Col xs={12} sm={8} lg={5}>
          <StatCard title="Total Sale" value={formatINR(data.overall?.saleValue ?? 0)} color="#2e7d32" />
        </Col>
        <Col xs={12} sm={8} lg={5}>
          <StatCard title="Total Margin" value={formatINR(data.overall?.margin ?? 0)}
            color={(data.overall?.margin ?? 0) >= 0 ? '#2e7d32' : '#cf1322'}
            prefix={(data.overall?.margin ?? 0) >= 0 ? <RiseOutlined /> : <FallOutlined />} />
        </Col>
      </Row>

      {/* ── Payables & Receivables ── */}
      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        <Col xs={24} lg={12}>
          <Card size="small" title={<><TeamOutlined style={{ color: '#cf1322', marginRight: 6 }} />Top Supplier Payables</>}>
            {data.topSupplierPayables?.length > 0
              ? <Table dataSource={data.topSupplierPayables} columns={payableColumns} rowKey="supplierId" pagination={false} size="small" />
              : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No outstanding payables" style={{ padding: '16px 0' }} />
            }
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card size="small" title={<><UserOutlined style={{ color: '#2e7d32', marginRight: 6 }} />Top Customer Receivables</>}>
            {data.topCustomerReceivables?.length > 0
              ? <Table dataSource={data.topCustomerReceivables} columns={receivableColumns} rowKey="customerId" pagination={false} size="small" />
              : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No outstanding receivables" style={{ padding: '16px 0' }} />
            }
          </Card>
        </Col>
      </Row>

      {/* ── Recent Deliveries ── */}
      <Card size="small" title={<><CarOutlined style={{ marginRight: 6 }} />Recent Deliveries</>}>
        {data.recentDeliveries?.length > 0
          ? <Table dataSource={data.recentDeliveries} columns={recentColumns} rowKey="id" pagination={false} size="small" scroll={{ x: 900 }} />
          : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No deliveries yet" style={{ padding: '24px 0' }} />
        }
      </Card>
    </div>
  )
}
