import { Row, Col, Card, Statistic, Table, Tag, Typography, Spin } from 'antd'
import { ArrowUpOutlined, ShoppingCartOutlined, CarOutlined, DollarOutlined } from '@ant-design/icons'
import { useDashboard } from '../../api/hooks'
import { formatINR, formatQt } from '../../utils/format'
import dayjs from 'dayjs'

export default function Dashboard() {
  const { data, isLoading } = useDashboard()

  if (isLoading) return <Spin size="large" style={{ display: 'block', margin: '60px auto' }} />
  if (!data) return null

  const columns = [
    { title: 'LR No.', dataIndex: 'deliveryNumber', key: 'deliveryNumber' },
    { title: 'Date', dataIndex: 'deliveryDate', key: 'deliveryDate', render: (v: string) => dayjs(v).format('DD MMM YYYY') },
    { title: 'Supplier', dataIndex: ['supplier', 'name'], key: 'supplier' },
    { title: 'Vehicle', dataIndex: 'vehicleNumber', key: 'vehicle' },
    { title: 'Weight (Qt)', dataIndex: 'adjustedWeight', key: 'weight', render: (v: number) => formatQt(v) },
    { title: 'Purchase Value', dataIndex: 'purchaseValue', key: 'pv', render: (v: number) => formatINR(v) },
    { title: 'Status', dataIndex: 'status', key: 'status', render: (v: string) => <Tag color="green">{v}</Tag> },
  ]

  return (
    <div>
      <Typography.Title level={4} style={{ marginBottom: 24 }}>Dashboard</Typography.Title>

      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic title="Today's Deliveries" value={data.today.deliveryCount} prefix={<CarOutlined />} valueStyle={{ color: '#2e7d32' }} />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic title="Today's Weight" value={formatQt(data.today.totalWeightQt)} valueStyle={{ color: '#2e7d32' }} />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic title="Total Payable (Suppliers)" value={formatINR(data.totalPayable)} valueStyle={{ color: '#cf1322' }} />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic title="Total Receivable (Buyers)" value={formatINR(data.totalReceivable)} prefix={<ArrowUpOutlined />} valueStyle={{ color: '#2e7d32' }} />
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic title="Open Purchase Orders" value={data.openPOs} prefix={<ShoppingCartOutlined />} />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic title="Open Sales Orders" value={data.openSOs} prefix={<DollarOutlined />} />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic title="Today's Purchase Value" value={formatINR(data.today.purchaseValue)} />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic title="Today's Margin" value={formatINR(data.today.margin)} valueStyle={{ color: data.today.margin >= 0 ? '#2e7d32' : '#cf1322' }} />
          </Card>
        </Col>
      </Row>

      <Card title="Recent Deliveries">
        <Table dataSource={data.recentDeliveries} columns={columns} rowKey="id" pagination={false} size="small" />
      </Card>
    </div>
  )
}
