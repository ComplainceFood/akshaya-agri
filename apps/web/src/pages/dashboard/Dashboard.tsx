import { Row, Col, Card, Statistic, Table, Typography, Spin, Progress, Empty } from 'antd'
import {
  ArrowUpOutlined, CarOutlined, TeamOutlined, UserOutlined,
  RiseOutlined, FallOutlined, DollarOutlined, BarChartOutlined,
} from '@ant-design/icons'
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import { useDashboard, usePurchaseOrders, useSalesOrders, useCommodities } from '../../api/hooks'
import { formatINR } from '../../utils/format'
import { QT_TO_KG } from '../../utils/constants'
import dayjs from 'dayjs'

const fmtKg = (qt: number) => `${(qt * QT_TO_KG).toLocaleString('en-IN', { maximumFractionDigits: 0 })} Kg`
const fmtCr = (v: number) => {
  if (Math.abs(v) >= 10000000) return `₹${(v / 10000000).toFixed(2)}Cr`
  if (Math.abs(v) >= 100000) return `₹${(v / 100000).toFixed(1)}L`
  return `₹${(v / 1000).toFixed(0)}K`
}
const todayStr = dayjs().format('YYYY-MM-DD')

const PIE_COLORS = ['#2e7d32', '#43a047', '#66bb6a', '#a5d6a7', '#1b5e20', '#81c784', '#388e3c', '#c8e6c9']

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

// ── Monthly Trend Chart ──────────────────────────────────────────────────────
function MonthlyTrendChart({ data }: { data: any[] }) {
  const chartData = data.map(d => ({
    month: dayjs(d.month + '-01').format('MMM YY'),
    'Purchase': d.purchaseValue,
    'Sale': d.saleValue,
    'Margin': d.margin,
  }))
  return (
    <Card size="small" title={<><RiseOutlined style={{ color: '#2e7d32', marginRight: 6 }} />6-Month Trend</>} style={{ height: '100%' }}>
      <ResponsiveContainer width="100%" height={220}>
        <AreaChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="colorSale" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#2e7d32" stopOpacity={0.15} />
              <stop offset="95%" stopColor="#2e7d32" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="colorPurchase" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#1677ff" stopOpacity={0.15} />
              <stop offset="95%" stopColor="#1677ff" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="colorMargin" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#fa8c16" stopOpacity={0.2} />
              <stop offset="95%" stopColor="#fa8c16" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="month" tick={{ fontSize: 11 }} />
          <YAxis tickFormatter={fmtCr} tick={{ fontSize: 10 }} width={48} />
          <Tooltip formatter={(v: any, name: any) => [formatINR(Number(v ?? 0)), String(name ?? '')]} labelStyle={{ fontWeight: 600 }} />
          <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
          <Area type="monotone" dataKey="Purchase" stroke="#1677ff" strokeWidth={2} fill="url(#colorPurchase)" dot={false} />
          <Area type="monotone" dataKey="Sale" stroke="#2e7d32" strokeWidth={2} fill="url(#colorSale)" dot={false} />
          <Area type="monotone" dataKey="Margin" stroke="#fa8c16" strokeWidth={2} fill="url(#colorMargin)" dot={false} />
        </AreaChart>
      </ResponsiveContainer>
    </Card>
  )
}

// ── Daily Volume Bar Chart ───────────────────────────────────────────────────
function DailyVolumeChart({ data }: { data: any[] }) {
  const chartData = data.map(d => ({
    day: dayjs(d.date).format('DD MMM'),
    'Sale Value': d.saleValue,
    'Margin': d.margin,
    positive: d.margin >= 0,
  }))
  return (
    <Card size="small" title={<><BarChartOutlined style={{ color: '#1677ff', marginRight: 6 }} />Last 30 Days - Daily Sale & Margin</>} style={{ height: '100%' }}>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }} barGap={2}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
          <XAxis dataKey="day" tick={{ fontSize: 9 }} interval={4} />
          <YAxis tickFormatter={fmtCr} tick={{ fontSize: 10 }} width={48} />
          <Tooltip formatter={(v: any, name: any) => [formatINR(Number(v ?? 0)), String(name ?? '')]} labelStyle={{ fontWeight: 600 }} />
          <Legend iconType="square" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
          <Bar dataKey="Sale Value" fill="#a5d6a7" radius={[2, 2, 0, 0]} maxBarSize={18} />
          <Bar dataKey="Margin" radius={[2, 2, 0, 0]} maxBarSize={18}>
            {chartData.map((entry, i) => (
              <Cell key={i} fill={entry.positive ? '#2e7d32' : '#cf1322'} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </Card>
  )
}

// ── Commodity Donut Chart ────────────────────────────────────────────────────
function CommodityDonut({ data }: { data: any[] }) {
  const top = data.slice(0, 7)
  const othersValue = data.slice(7).reduce((s: number, d: any) => s + d.saleValue, 0)
  const chartData = othersValue > 0 ? [...top, { name: 'Others', saleValue: othersValue }] : top

  const renderLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent }: any) => {
    if (percent < 0.06) return null
    const RADIAN = Math.PI / 180
    const r = innerRadius + (outerRadius - innerRadius) * 0.5
    const x = cx + r * Math.cos(-midAngle * RADIAN)
    const y = cy + r * Math.sin(-midAngle * RADIAN)
    return <text x={x} y={y} fill="#fff" textAnchor="middle" dominantBaseline="central" fontSize={10} fontWeight={600}>{`${(percent * 100).toFixed(0)}%`}</text>
  }

  return (
    <Card size="small" title={<><DollarOutlined style={{ color: '#fa8c16', marginRight: 6 }} />Commodity-wise Sale Value</>} style={{ height: '100%' }}>
      <ResponsiveContainer width="100%" height={220}>
        <PieChart>
          <Pie data={chartData} dataKey="saleValue" nameKey="name" cx="45%" cy="50%"
            innerRadius={55} outerRadius={90} labelLine={false} label={renderLabel}>
            {chartData.map((_: any, i: number) => (
              <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
            ))}
          </Pie>
          <Tooltip formatter={(v: any) => formatINR(Number(v ?? 0))} />
          <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} layout="vertical" align="right" verticalAlign="middle" />
        </PieChart>
      </ResponsiveContainer>
    </Card>
  )
}

// ── Payable vs Receivable Bar ────────────────────────────────────────────────
function PayableReceivableBar({ payable, receivable }: { payable: number; receivable: number }) {
  const max = Math.max(payable, receivable, 1)
  return (
    <Card size="small" title={<><TeamOutlined style={{ marginRight: 6 }} />Payable vs Receivable</>}>
      <div style={{ padding: '8px 0' }}>
        <div style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
            <span style={{ color: '#cf1322', fontWeight: 600 }}>Supplier Payable</span>
            <span style={{ fontWeight: 700 }}>{formatINR(payable)}</span>
          </div>
          <Progress percent={Math.round((payable / max) * 100)} showInfo={false} strokeColor="#cf1322" trailColor="#fce4e4" size={['100%', 10]} />
        </div>
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
            <span style={{ color: '#2e7d32', fontWeight: 600 }}>Customer Receivable</span>
            <span style={{ fontWeight: 700 }}>{formatINR(receivable)}</span>
          </div>
          <Progress percent={Math.round((receivable / max) * 100)} showInfo={false} strokeColor="#2e7d32" trailColor="#e8f5e9" size={['100%', 10]} />
        </div>
        <div style={{ marginTop: 12, padding: '8px 12px', background: (receivable - payable) >= 0 ? '#f1f8f1' : '#fff3f3', borderRadius: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: '#666' }}>Net Position</span>
          <span style={{ fontWeight: 700, fontSize: 15, color: (receivable - payable) >= 0 ? '#2e7d32' : '#cf1322' }}>
            {formatINR(receivable - payable)}
          </span>
        </div>
      </div>
    </Card>
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
      <div style={{ marginBottom: 16 }}>
        <Typography.Title level={4} style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>Dashboard</Typography.Title>
        <div style={{ fontSize: 12, color: '#999', marginTop: 2 }}>{dayjs().format('dddd, DD MMMM YYYY')}</div>
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

      {/* ── Charts Row ── */}
      <SectionLabel><RiseOutlined /> Analytics</SectionLabel>
      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        <Col xs={24} lg={14}>
          <MonthlyTrendChart data={data.monthlyTrend || []} />
        </Col>
        <Col xs={24} lg={10}>
          <CommodityDonut data={data.commodityBreakdown || []} />
        </Col>
      </Row>
      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        <Col xs={24} lg={16}>
          <DailyVolumeChart data={data.dailyTrend || []} />
        </Col>
        <Col xs={24} lg={8}>
          <PayableReceivableBar payable={data.totalPayable} receivable={data.totalReceivable} />
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
