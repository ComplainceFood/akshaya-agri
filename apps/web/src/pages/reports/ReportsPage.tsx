import { useState } from 'react'
import { Tabs, Table, Typography, DatePicker, Button, Card, Statistic, Row, Col, Tag } from 'antd'
import { usePnL, useStockReport } from '../../api/hooks'
import { formatINR, formatQt } from '../../utils/format'
import dayjs from 'dayjs'

const { RangePicker } = DatePicker

export default function ReportsPage() {
  const [dateRange, setDateRange] = useState<[string, string] | null>(null)
  const { data: pnl, isLoading: pnlLoading } = usePnL(
    dateRange ? { from: dateRange[0], to: dateRange[1] } : undefined
  )
  const { data: stock = [], isLoading: stockLoading } = useStockReport()

  const pnlColumns = [
    { title: 'LR No.', dataIndex: 'deliveryNumber', key: 'lr' },
    { title: 'Date', dataIndex: 'deliveryDate', key: 'date', render: (v: string) => dayjs(v).format('DD MMM YYYY') },
    { title: 'Supplier', dataIndex: ['supplier', 'name'], key: 'supplier' },
    { title: 'Commodity', dataIndex: ['commodity', 'name'], key: 'commodity' },
    { title: 'Weight (Qt)', dataIndex: 'adjustedWeight', key: 'weight', render: formatQt },
    { title: 'Purchase Value', dataIndex: 'purchaseValue', key: 'pv', render: (v: number) => formatINR(v) },
    { title: 'Sale Value', dataIndex: 'saleValue', key: 'sv', render: (v: number) => v ? formatINR(v) : '—' },
    { title: 'Margin', dataIndex: 'grossMargin', key: 'margin', render: (v: number) => v != null ? <span style={{ color: v >= 0 ? '#2e7d32' : '#cf1322' }}>{formatINR(v)}</span> : '—' },
  ]

  const stockColumns = [
    { title: 'PO Number', dataIndex: 'poNumber', key: 'po', render: (v: string) => <b>{v}</b> },
    { title: 'Supplier', dataIndex: ['supplier', 'name'], key: 'supplier' },
    { title: 'Commodity', dataIndex: ['commodity', 'name'], key: 'commodity' },
    { title: 'Ordered (Qt)', dataIndex: 'quantityOrdered', key: 'ordered', render: formatQt },
    { title: 'Delivered (Qt)', dataIndex: 'deliveredQt', key: 'delivered', render: formatQt },
    { title: 'Pending (Qt)', dataIndex: 'pendingQt', key: 'pending', render: (v: number) => <span style={{ color: v > 0 ? '#cf1322' : '#2e7d32' }}>{formatQt(v)}</span> },
    { title: 'Status', dataIndex: 'status', key: 'status', render: (v: string) => <Tag color="blue">{v}</Tag> },
  ]

  return (
    <div>
      <Typography.Title level={4} style={{ marginBottom: 16 }}>Reports</Typography.Title>
      <Tabs
        items={[
          {
            key: 'pnl', label: 'Profit & Loss',
            children: (
              <div>
                <div style={{ display: 'flex', gap: 12, marginBottom: 16, alignItems: 'center' }}>
                  <RangePicker format="DD/MM/YYYY" onChange={(_, s) => setDateRange(s[0] && s[1] ? [s[0], s[1]] : null)} />
                  <Button onClick={() => setDateRange(null)}>Clear</Button>
                </div>
                {pnl && (
                  <Row gutter={16} style={{ marginBottom: 16 }}>
                    <Col span={6}><Card><Statistic title="Total Weight" value={formatQt(pnl.totalWeight)} /></Card></Col>
                    <Col span={6}><Card><Statistic title="Total Purchase" value={formatINR(pnl.totalPurchase)} /></Card></Col>
                    <Col span={6}><Card><Statistic title="Total Sale" value={formatINR(pnl.totalSale)} valueStyle={{ color: '#2e7d32' }} /></Card></Col>
                    <Col span={6}><Card><Statistic title="Total Margin" value={formatINR(pnl.totalMargin)} valueStyle={{ color: pnl.totalMargin >= 0 ? '#2e7d32' : '#cf1322' }} /></Card></Col>
                  </Row>
                )}
                <Table dataSource={pnl?.deliveries || []} columns={pnlColumns} rowKey="id" loading={pnlLoading} scroll={{ x: 900 }} />
              </div>
            )
          },
          {
            key: 'stock', label: 'Stock Position (Open POs)',
            children: (
              <Table dataSource={stock} columns={stockColumns} rowKey="id" loading={stockLoading} />
            )
          }
        ]}
      />
    </div>
  )
}
