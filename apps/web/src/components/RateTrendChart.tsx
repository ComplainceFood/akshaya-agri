import { useMemo, useState } from 'react'
import { Card, Select, Empty, Spin, Tag, Typography } from 'antd'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine } from 'recharts'
import { usePurchaseOrders, useSalesOrders, useCommodities } from '../api/hooks'
import dayjs from 'dayjs'

const PURCHASE_COLOR = '#1677ff'
const SALE_COLOR = '#52c41a'
const MARGIN_COLOR = '#faad14'

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  const purchase = payload.find((p: any) => p.dataKey === 'purchase')?.value
  const sale = payload.find((p: any) => p.dataKey === 'sale')?.value
  const margin = sale != null && purchase != null ? sale - purchase : null
  return (
    <div style={{ background: '#fff', border: '1px solid #e8e8e8', borderRadius: 8, padding: '10px 14px', boxShadow: '0 2px 8px rgba(0,0,0,0.1)', fontSize: 13 }}>
      <div style={{ fontWeight: 600, marginBottom: 6, color: '#333' }}>{label}</div>
      {purchase != null && <div style={{ color: PURCHASE_COLOR }}>Purchase: ₹{Number(purchase).toLocaleString('en-IN', { maximumFractionDigits: 2 })}/Qt</div>}
      {sale != null && <div style={{ color: SALE_COLOR }}>Sale: ₹{Number(sale).toLocaleString('en-IN', { maximumFractionDigits: 2 })}/Qt</div>}
      {margin != null && (
        <div style={{ color: margin >= 0 ? MARGIN_COLOR : '#ff4d4f', fontWeight: 600, marginTop: 4, borderTop: '1px solid #f0f0f0', paddingTop: 4 }}>
          Margin: {margin >= 0 ? '+' : ''}₹{Number(margin).toLocaleString('en-IN', { maximumFractionDigits: 2 })}/Qt
        </div>
      )}
    </div>
  )
}

export default function RateTrendChart() {
  const { data: purchaseRates = [], isLoading: loadingPR } = usePurchaseOrders()
  const { data: saleRates = [], isLoading: loadingSR } = useSalesOrders()
  const { data: commodities = [] } = useCommodities()

  const [selectedCommodity, setSelectedCommodity] = useState<string | null>(null)

  const activeCommodityId = useMemo(() => {
    if (selectedCommodity) return selectedCommodity
    if (commodities.length > 0) return commodities[0].id
    return null
  }, [selectedCommodity, commodities])

  const chartData = useMemo(() => {
    if (!activeCommodityId) return []
    const pr = purchaseRates.filter((r: any) => r.commodityId === activeCommodityId)
    const sr = saleRates.filter((r: any) => r.commodityId === activeCommodityId)

    const dateMap: Record<string, { date: string; purchase?: number; sale?: number }> = {}
    pr.forEach((r: any) => {
      const d = r.rateDate
      if (!dateMap[d]) dateMap[d] = { date: d }
      dateMap[d].purchase = Number(r.ratePerQuintal)
    })
    sr.forEach((r: any) => {
      const d = r.rateDate
      if (!dateMap[d]) dateMap[d] = { date: d }
      dateMap[d].sale = Number(r.ratePerQuintal)
    })

    return Object.values(dateMap)
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-60)
      .map(d => ({ ...d, label: dayjs(d.date).format('DD MMM') }))
  }, [activeCommodityId, purchaseRates, saleRates])

  const stats = useMemo(() => {
    const withBoth = chartData.filter(d => d.purchase != null && d.sale != null)
    if (!withBoth.length) return null
    const margins = withBoth.map(d => d.sale! - d.purchase!)
    const latest = withBoth[withBoth.length - 1]
    const avg = margins.reduce((a, b) => a + b, 0) / margins.length
    const min = Math.min(...margins)
    const max = Math.max(...margins)
    return { latest: latest ? latest.sale! - latest.purchase! : null, avg, min, max }
  }, [chartData])

  const loading = loadingPR || loadingSR

  return (
    <Card
      style={{ marginBottom: 20 }}
      styles={{ body: { paddingTop: 12 } }}
      title={
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <Typography.Text strong style={{ fontSize: 15 }}>Rate Trend</Typography.Text>
          <Select
            style={{ width: 200 }}
            placeholder="Select commodity"
            value={activeCommodityId}
            onChange={v => setSelectedCommodity(v)}
            showSearch
            optionFilterProp="label"
            options={commodities.map((c: any) => ({ value: c.id, label: c.name }))}
          />
        </div>
      }
    >
      {stats && (
        <div style={{ display: 'flex', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
          {stats.latest != null && (
            <Tag color={stats.latest >= 0 ? 'green' : 'red'} style={{ fontSize: 12, padding: '2px 10px' }}>
              Latest Margin: {stats.latest >= 0 ? '+' : ''}₹{stats.latest.toFixed(2)}/Qt
            </Tag>
          )}
          <Tag color="blue" style={{ fontSize: 12, padding: '2px 10px' }}>
            Avg Margin: ₹{stats.avg.toFixed(2)}/Qt
          </Tag>
          <Tag color="orange" style={{ fontSize: 12, padding: '2px 10px' }}>
            Range: ₹{stats.min.toFixed(2)} – ₹{stats.max.toFixed(2)}/Qt
          </Tag>
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>
      ) : chartData.length === 0 ? (
        <Empty description="No rate data for this commodity" style={{ padding: 32 }} />
      ) : (
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `₹${v}`} width={70} />
            <Tooltip content={<CustomTooltip />} />
            <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
            <ReferenceLine y={0} stroke="#ccc" />
            <Line
              type="monotone"
              dataKey="purchase"
              name="Purchase Rate"
              stroke={PURCHASE_COLOR}
              strokeWidth={2}
              dot={{ r: 3 }}
              activeDot={{ r: 5 }}
              connectNulls
            />
            <Line
              type="monotone"
              dataKey="sale"
              name="Sale Rate"
              stroke={SALE_COLOR}
              strokeWidth={2}
              dot={{ r: 3 }}
              activeDot={{ r: 5 }}
              connectNulls
            />
          </LineChart>
        </ResponsiveContainer>
      )}
    </Card>
  )
}
