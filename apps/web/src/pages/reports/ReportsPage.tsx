import { useState } from 'react'
import {
  Tabs, Table, Typography, DatePicker, Card, Statistic, Row, Col,
  Select, Space, Progress, Divider, Button,
} from 'antd'
import {
  ArrowDownOutlined, ArrowUpOutlined, TeamOutlined, UserOutlined,
  CarOutlined, DollarOutlined, BarChartOutlined, FilePdfOutlined,
} from '@ant-design/icons'
import { usePnL, useSupplierReport, useCustomerReport, usePaymentsReport, useStockReport, useSuppliers, useCustomers, useCommodities } from '../../api/hooks'
import { formatINR, formatQt } from '../../utils/format'
import dayjs from 'dayjs'

const { RangePicker } = DatePicker

// ── PDF export ───────────────────────────────────────────────────────────────
function exportToPDF(title: string, subtitle: string, contentId: string) {
  const content = document.getElementById(contentId)
  if (!content) return
  const printWindow = window.open('', '_blank')
  if (!printWindow) return
  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <title>${title}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, sans-serif; font-size: 11px; color: #222; background: #fff; padding: 24px 32px; }
    .pdf-header { border-bottom: 2px solid #2e7d32; padding-bottom: 12px; margin-bottom: 16px; display: flex; justify-content: space-between; align-items: flex-end; }
    .pdf-header-left h1 { font-size: 18px; color: #2e7d32; font-weight: 700; }
    .pdf-header-left p { font-size: 11px; color: #555; margin-top: 2px; }
    .pdf-header-right { text-align: right; font-size: 10px; color: #888; }
    .pdf-title { font-size: 13px; font-weight: 700; color: #333; margin-bottom: 2px; }
    .pdf-subtitle { font-size: 10px; color: #666; margin-bottom: 14px; }
    .summary-grid { display: grid; gap: 10px; margin-bottom: 16px; }
    .summary-card { border: 1px solid #e0e0e0; border-radius: 6px; padding: 10px 12px; background: #fafafa; }
    .summary-card .label { font-size: 10px; color: #888; margin-bottom: 3px; }
    .summary-card .value { font-size: 13px; font-weight: 700; color: #222; }
    table { width: 100%; border-collapse: collapse; font-size: 10px; }
    thead tr { background: #2e7d32; color: #fff; }
    thead th { padding: 6px 8px; text-align: left; font-weight: 600; white-space: nowrap; }
    thead th.right { text-align: right; }
    tbody tr:nth-child(even) { background: #f5f9f5; }
    tbody td { padding: 5px 8px; border-bottom: 1px solid #e8e8e8; white-space: nowrap; }
    tbody td.right { text-align: right; }
    tfoot tr { background: #e8f5e9; font-weight: 700; }
    tfoot td { padding: 6px 8px; border-top: 2px solid #2e7d32; white-space: nowrap; }
    tfoot td.right { text-align: right; }
    .green { color: #2e7d32; }
    .red { color: #c62828; }
    .section-title { font-size: 11px; font-weight: 700; color: #2e7d32; border-bottom: 1px solid #c8e6c9; padding-bottom: 4px; margin: 16px 0 8px; }
    .pdf-footer { margin-top: 24px; border-top: 1px solid #e0e0e0; padding-top: 8px; font-size: 9px; color: #aaa; display: flex; justify-content: space-between; }
    @media print { body { padding: 12px 16px; } }
  </style>
</head>
<body>
  <div class="pdf-header">
    <div class="pdf-header-left">
      <h1>Akshaya Agri Solutions</h1>
      <p>Agricultural Commodity Trading</p>
    </div>
    <div class="pdf-header-right">
      <div>Generated: ${dayjs().format('DD MMM YYYY, h:mm A')}</div>
    </div>
  </div>
  <div class="pdf-title">${title}</div>
  <div class="pdf-subtitle">${subtitle}</div>
  ${content.innerHTML}
  <div class="pdf-footer">
    <span>Akshaya Agri Solutions | Confidential</span>
    <span>Printed on ${dayjs().format('DD/MM/YYYY')}</span>
  </div>
</body>
</html>`
  printWindow.document.open()
  // eslint-disable-next-line -- document.write is required for cross-browser print windows
  printWindow.document.write(html)
  printWindow.document.close()
  setTimeout(() => { printWindow.print() }, 400)
}

// ── Shared components ────────────────────────────────────────────────────────
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
      onChange={(dates) => onChange(
        dates?.[0]?.format('YYYY-MM-DD') ?? null,
        dates?.[1]?.format('YYYY-MM-DD') ?? null
      )}
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
  const params: any = {}
  if (from) params.from = from
  if (to) params.to = to
  if (commodityId) params.commodityId = commodityId
  const { data: pnl, isLoading } = usePnL(params)

  const marginPct = pnl?.totalSale > 0 ? (pnl.totalMargin / pnl.totalSale) * 100 : 0

  const nowrap = { onCell: () => ({ style: { whiteSpace: 'nowrap' as const } }) }

  const columns = [
    { title: 'Date', dataIndex: 'deliveryDate', key: 'date', width: 90, ...nowrap, render: (v: string) => dayjs(v).format('DD/MM/YY') },
    { title: 'LR / Slip', key: 'lr', width: 90, ...nowrap, render: (_: any, r: any) => r.lrNumber || r.deliveryNumber },
    { title: 'Supplier', dataIndex: ['supplier', 'name'], key: 'supplier', width: 150, ellipsis: true, ...nowrap },
    { title: 'Customer', dataIndex: ['customer', 'name'], key: 'customer', width: 150, ellipsis: true, ...nowrap },
    { title: 'Commodity', dataIndex: ['commodity', 'name'], key: 'commodity', width: 120, ellipsis: true, ...nowrap },
    { title: 'Wt (Qt)', dataIndex: 'adjustedWeight', key: 'wt', width: 85, align: 'right' as const, ...nowrap, render: formatQt },
    { title: 'Buy ₹/Qt', dataIndex: 'purchaseRate', key: 'br', width: 80, align: 'right' as const, ...nowrap, render: (v: number) => v ? Number(v).toLocaleString('en-IN', { maximumFractionDigits: 2 }) : '-' },
    { title: 'Sell ₹/Qt', dataIndex: 'saleRate', key: 'sr', width: 80, align: 'right' as const, ...nowrap, render: (v: number) => v ? Number(v).toLocaleString('en-IN', { maximumFractionDigits: 2 }) : '-' },
    { title: 'Sale Value', dataIndex: 'saleValue', key: 'sv', width: 110, align: 'right' as const, ...nowrap, render: (v: number) => v ? formatINR(v) : '-' },
    {
      title: 'Margin', dataIndex: 'grossMargin', key: 'margin', width: 110, align: 'right' as const, ...nowrap,
      render: (v: number) => v != null ? <span style={{ color: v >= 0 ? '#2e7d32' : '#cf1322', fontWeight: 600 }}>{formatINR(v)}</span> : '-'
    },
  ]

  const dateLabel = from && to ? `${dayjs(from).format('DD MMM YYYY')} to${dayjs(to).format('DD MMM YYYY')}` : 'All dates'

  const pdfContent = () => {
    const rows = pnl?.deliveries || []
    const totalWeight = rows.reduce((s: number, r: any) => s + Number(r.adjustedWeight ?? 0), 0)
    return `
      <div class="summary-grid" style="grid-template-columns:repeat(4,1fr)">
        <div class="summary-card"><div class="label">Total Weight</div><div class="value">${formatQt(pnl?.totalWeight ?? 0)}</div></div>
        <div class="summary-card"><div class="label">Purchase Value</div><div class="value">${formatINR(pnl?.totalPurchase ?? 0)}</div></div>
        <div class="summary-card"><div class="label">Sale Value</div><div class="value green">${formatINR(pnl?.totalSale ?? 0)}</div></div>
        <div class="summary-card"><div class="label">Gross Margin</div><div class="value ${(pnl?.totalMargin ?? 0) >= 0 ? 'green' : 'red'}">${formatINR(pnl?.totalMargin ?? 0)}</div></div>
      </div>
      <table>
        <thead><tr>
          <th>Date</th><th>LR / Slip</th><th>Supplier</th><th>Customer</th><th>Commodity</th>
          <th class="right">Wt (Qt)</th><th class="right">Buy ₹/Qt</th><th class="right">Sell ₹/Qt</th>
          <th class="right">Sale Value</th><th class="right">Margin</th>
        </tr></thead>
        <tbody>
          ${rows.map((r: any) => `<tr>
            <td>${dayjs(r.deliveryDate).format('DD/MM/YY')}</td>
            <td>${r.lrNumber || r.deliveryNumber || '-'}</td>
            <td>${r.supplier?.name || '-'}</td>
            <td>${r.customer?.name || '-'}</td>
            <td>${r.commodity?.name || '-'}</td>
            <td class="right">${formatQt(r.adjustedWeight)}</td>
            <td class="right">${r.purchaseRate ? Number(r.purchaseRate).toLocaleString('en-IN', { maximumFractionDigits: 2 }) : '-'}</td>
            <td class="right">${r.saleRate ? Number(r.saleRate).toLocaleString('en-IN', { maximumFractionDigits: 2 }) : '-'}</td>
            <td class="right">${r.saleValue ? formatINR(r.saleValue) : '-'}</td>
            <td class="right ${(r.grossMargin ?? 0) >= 0 ? 'green' : 'red'}">${r.grossMargin != null ? formatINR(r.grossMargin) : '-'}</td>
          </tr>`).join('')}
        </tbody>
        <tfoot><tr>
          <td colspan="5"><b>Total (${rows.length} deliveries)</b></td>
          <td class="right">${formatQt(totalWeight)}</td>
          <td></td><td></td>
          <td class="right">${formatINR(pnl?.totalSale ?? 0)}</td>
          <td class="right ${(pnl?.totalMargin ?? 0) >= 0 ? 'green' : 'red'}">${formatINR(pnl?.totalMargin ?? 0)}</td>
        </tr></tfoot>
      </table>`
  }

  return (
    <div>
      <Space wrap style={{ marginBottom: 16 }}>
        <DateFilter onChange={(f, t) => { setFrom(f); setTo(t) }} />
        <Select placeholder="Filter Commodity" allowClear showSearch optionFilterProp="label" style={{ width: 180 }}
          options={commodities.map((c: any) => ({ value: c.id, label: c.name }))}
          onChange={v => setCommodityId(v ?? null)} />
        <Button icon={<FilePdfOutlined />} onClick={() => {
          const tmp = document.createElement('div')
          tmp.id = '__pnl_pdf__'
          tmp.style.display = 'none'
          tmp.innerHTML = pdfContent()
          document.body.appendChild(tmp)
          exportToPDF('P&L / Deliveries Report', dateLabel, '__pnl_pdf__')
          setTimeout(() => document.body.removeChild(tmp), 1000)
        }}>Export PDF</Button>
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
        loading={isLoading} size="small" scroll={{ x: 900 }}
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
  const sParams: any = {}
  if (from) sParams.from = from
  if (to) sParams.to = to
  if (supplierId) sParams.supplierId = supplierId
  const { data, isLoading } = useSupplierReport(sParams)
  const rows: any[] = data?.rows || []
  const payments: any[] = data?.paymentHistory || []

  const totalOutstanding = rows.reduce((s, r) => s + Math.max(0, r.outstanding), 0)
  const totalPurchase = rows.reduce((s, r) => s + r.totalPurchaseValue, 0)
  const totalPaid = rows.reduce((s, r) => s + r.totalPaid, 0)

  const nw = { onCell: () => ({ style: { whiteSpace: 'nowrap' as const } }) }

  const summaryColumns = [
    { title: 'Supplier', dataIndex: 'name', key: 'name', ...nw, render: (v: string) => <b>{v}</b> },
    { title: 'Deliveries', dataIndex: 'deliveryCount', key: 'dc', align: 'right' as const, width: 80, ...nw },
    { title: 'Weight (Qt)', dataIndex: 'totalWeight', key: 'wt', align: 'right' as const, width: 110, ...nw, render: formatQt },
    { title: 'Purchase Value', dataIndex: 'totalPurchaseValue', key: 'pv', align: 'right' as const, ...nw, render: (v: number) => formatINR(v) },
    { title: 'Net Payable', dataIndex: 'totalNetPayable', key: 'np', align: 'right' as const, ...nw, render: (v: number) => formatINR(v) },
    { title: 'Paid', dataIndex: 'totalPaid', key: 'pd', align: 'right' as const, ...nw, render: (v: number) => <span style={{ color: '#2e7d32' }}>{formatINR(v)}</span> },
    {
      title: 'Outstanding', dataIndex: 'outstanding', key: 'os', align: 'right' as const, ...nw,
      render: (v: number) => <b style={{ color: v > 0 ? '#cf1322' : '#2e7d32' }}>{formatINR(v)}</b>
    },
  ]

  const paymentColumns = [
    { title: 'Receipt No.', dataIndex: 'paymentNumber', key: 'pn', width: 110, ...nw },
    { title: 'Date', dataIndex: 'paymentDate', key: 'date', width: 90, ...nw, render: (v: string) => dayjs(v).format('DD/MM/YYYY') },
    { title: 'Supplier', dataIndex: ['supplier', 'name'], key: 'supplier', ...nw },
    { title: 'Amount', dataIndex: 'amount', key: 'amt', align: 'right' as const, ...nw, render: (v: number) => <b style={{ color: '#2e7d32' }}>{formatINR(v)}</b> },
    { title: 'Notes', dataIndex: 'notes', key: 'notes', ellipsis: true },
  ]

  const dateLabel = from && to ? `${dayjs(from).format('DD MMM YYYY')} to${dayjs(to).format('DD MMM YYYY')}` : 'All dates'
  const filterLabel = supplierId ? (suppliers.find((s: any) => s.id === supplierId)?.name ?? '') : 'All Suppliers'

  const pdfContent = () => `
    <div class="summary-grid" style="grid-template-columns:repeat(3,1fr)">
      <div class="summary-card"><div class="label">Total Purchase Value</div><div class="value">${formatINR(totalPurchase)}</div></div>
      <div class="summary-card"><div class="label">Total Paid</div><div class="value green">${formatINR(totalPaid)}</div></div>
      <div class="summary-card"><div class="label">Total Outstanding</div><div class="value red">${formatINR(totalOutstanding)}</div></div>
    </div>
    <table>
      <thead><tr>
        <th>Supplier</th><th class="right">Deliveries</th><th class="right">Weight (Qt)</th>
        <th class="right">Purchase Value</th><th class="right">Net Payable</th>
        <th class="right">Paid</th><th class="right">Outstanding</th>
      </tr></thead>
      <tbody>
        ${rows.map((r: any) => `<tr>
          <td><b>${r.name}</b></td>
          <td class="right">${r.deliveryCount}</td>
          <td class="right">${formatQt(r.totalWeight)}</td>
          <td class="right">${formatINR(r.totalPurchaseValue)}</td>
          <td class="right">${formatINR(r.totalNetPayable)}</td>
          <td class="right green">${formatINR(r.totalPaid)}</td>
          <td class="right ${r.outstanding > 0 ? 'red' : 'green'}">${formatINR(r.outstanding)}</td>
        </tr>`).join('')}
      </tbody>
      <tfoot><tr>
        <td><b>Total</b></td>
        <td class="right">${rows.reduce((s, r) => s + r.deliveryCount, 0)}</td>
        <td class="right">${formatQt(rows.reduce((s, r) => s + r.totalWeight, 0))}</td>
        <td class="right">${formatINR(totalPurchase)}</td>
        <td class="right">${formatINR(rows.reduce((s, r) => s + r.totalNetPayable, 0))}</td>
        <td class="right green">${formatINR(totalPaid)}</td>
        <td class="right red">${formatINR(totalOutstanding)}</td>
      </tr></tfoot>
    </table>
    ${payments.length > 0 ? `
      <div class="section-title">Payment History</div>
      <table>
        <thead><tr><th>Receipt No.</th><th>Date</th><th>Supplier</th><th class="right">Amount</th><th>Notes</th></tr></thead>
        <tbody>
          ${payments.map((p: any) => `<tr>
            <td>${p.paymentNumber}</td>
            <td>${dayjs(p.paymentDate).format('DD/MM/YYYY')}</td>
            <td>${p.supplier?.name || '-'}</td>
            <td class="right green"><b>${formatINR(p.amount)}</b></td>
            <td>${p.notes || '-'}</td>
          </tr>`).join('')}
        </tbody>
      </table>` : ''}`

  return (
    <div>
      <Space wrap style={{ marginBottom: 16 }}>
        <DateFilter onChange={(f, t) => { setFrom(f); setTo(t) }} />
        <Select placeholder="All Suppliers" allowClear showSearch optionFilterProp="label" style={{ width: 200 }}
          options={suppliers.map((s: any) => ({ value: s.id, label: s.name }))}
          onChange={v => setSupplierId(v ?? null)} />
        <Button icon={<FilePdfOutlined />} onClick={() => {
          const tmp = document.createElement('div')
          tmp.id = '__sup_pdf__'
          tmp.style.display = 'none'
          tmp.innerHTML = pdfContent()
          document.body.appendChild(tmp)
          exportToPDF('Supplier-wise Report', `${filterLabel} | ${dateLabel}`, '__sup_pdf__')
          setTimeout(() => document.body.removeChild(tmp), 1000)
        }}>Export PDF</Button>
      </Space>

      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        <Col xs={12} sm={8}><SummaryCard title="Total Purchase Value" value={formatINR(totalPurchase)} prefix={<TeamOutlined />} /></Col>
        <Col xs={12} sm={8}><SummaryCard title="Total Paid" value={formatINR(totalPaid)} color="#2e7d32" prefix={<ArrowUpOutlined />} /></Col>
        <Col xs={12} sm={8}><SummaryCard title="Total Outstanding" value={formatINR(totalOutstanding)} color="#cf1322" prefix={<ArrowDownOutlined />} /></Col>
      </Row>

      <Table dataSource={rows} columns={summaryColumns} rowKey="supplierId" loading={isLoading} size="small"
        scroll={{ x: 800 }} pagination={false}
        summary={rows.length > 1 ? () => (
          <Table.Summary.Row style={{ fontWeight: 600, background: '#fafafa' }}>
            <Table.Summary.Cell index={0}>Total</Table.Summary.Cell>
            <Table.Summary.Cell index={1} align="right">{rows.reduce((s, r) => s + r.deliveryCount, 0)}</Table.Summary.Cell>
            <Table.Summary.Cell index={2} align="right">{formatQt(rows.reduce((s, r) => s + r.totalWeight, 0))}</Table.Summary.Cell>
            <Table.Summary.Cell index={3} align="right">{formatINR(totalPurchase)}</Table.Summary.Cell>
            <Table.Summary.Cell index={4} align="right">{formatINR(rows.reduce((s, r) => s + r.totalNetPayable, 0))}</Table.Summary.Cell>
            <Table.Summary.Cell index={5} align="right"><span style={{ color: '#2e7d32' }}>{formatINR(totalPaid)}</span></Table.Summary.Cell>
            <Table.Summary.Cell index={6} align="right"><span style={{ color: '#cf1322' }}>{formatINR(totalOutstanding)}</span></Table.Summary.Cell>
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
  const cParams: any = {}
  if (from) cParams.from = from
  if (to) cParams.to = to
  if (customerId) cParams.customerId = customerId
  const { data, isLoading } = useCustomerReport(cParams)
  const rows: any[] = data?.rows || []
  const receipts: any[] = data?.receiptHistory || []

  const totalOutstanding = rows.reduce((s, r) => s + Math.max(0, r.outstanding), 0)
  const totalSale = rows.reduce((s, r) => s + r.totalSaleValue, 0)
  const totalReceived = rows.reduce((s, r) => s + r.totalReceived, 0)

  const nw = { onCell: () => ({ style: { whiteSpace: 'nowrap' as const } }) }

  const summaryColumns = [
    { title: 'Customer', dataIndex: 'name', key: 'name', ...nw, render: (v: string) => <b>{v}</b> },
    { title: 'Deliveries', dataIndex: 'deliveryCount', key: 'dc', align: 'right' as const, width: 80, ...nw },
    { title: 'Weight (Qt)', dataIndex: 'totalWeight', key: 'wt', align: 'right' as const, width: 110, ...nw, render: formatQt },
    { title: 'Sale Value', dataIndex: 'totalSaleValue', key: 'sv', align: 'right' as const, ...nw, render: (v: number) => formatINR(v) },
    { title: 'Margin', dataIndex: 'totalMargin', key: 'mg', align: 'right' as const, ...nw, render: (v: number) => <span style={{ color: v >= 0 ? '#2e7d32' : '#cf1322' }}>{formatINR(v)}</span> },
    { title: 'Received', dataIndex: 'totalReceived', key: 'rc', align: 'right' as const, ...nw, render: (v: number) => <span style={{ color: '#2e7d32' }}>{formatINR(v)}</span> },
    {
      title: 'Outstanding', dataIndex: 'outstanding', key: 'os', align: 'right' as const, ...nw,
      render: (v: number) => <b style={{ color: v > 0 ? '#cf1322' : '#2e7d32' }}>{formatINR(v)}</b>
    },
  ]

  const receiptColumns = [
    { title: 'Receipt No.', dataIndex: 'receiptNumber', key: 'rn', width: 110, ...nw },
    { title: 'Date', dataIndex: 'receiptDate', key: 'date', width: 90, ...nw, render: (v: string) => dayjs(v).format('DD/MM/YYYY') },
    { title: 'Customer', dataIndex: ['customer', 'name'], key: 'customer', ...nw },
    { title: 'Amount', dataIndex: 'amount', key: 'amt', align: 'right' as const, ...nw, render: (v: number) => <b style={{ color: '#2e7d32' }}>{formatINR(v)}</b> },
    { title: 'Notes', dataIndex: 'notes', key: 'notes', ellipsis: true },
  ]

  const dateLabel = from && to ? `${dayjs(from).format('DD MMM YYYY')} to${dayjs(to).format('DD MMM YYYY')}` : 'All dates'
  const filterLabel = customerId ? (customers.find((c: any) => c.id === customerId)?.name ?? '') : 'All Customers'

  const pdfContent = () => `
    <div class="summary-grid" style="grid-template-columns:repeat(3,1fr)">
      <div class="summary-card"><div class="label">Total Sale Value</div><div class="value">${formatINR(totalSale)}</div></div>
      <div class="summary-card"><div class="label">Total Received</div><div class="value green">${formatINR(totalReceived)}</div></div>
      <div class="summary-card"><div class="label">Total Outstanding</div><div class="value red">${formatINR(totalOutstanding)}</div></div>
    </div>
    <table>
      <thead><tr>
        <th>Customer</th><th class="right">Deliveries</th><th class="right">Weight (Qt)</th>
        <th class="right">Sale Value</th><th class="right">Margin</th>
        <th class="right">Received</th><th class="right">Outstanding</th>
      </tr></thead>
      <tbody>
        ${rows.map((r: any) => `<tr>
          <td><b>${r.name}</b></td>
          <td class="right">${r.deliveryCount}</td>
          <td class="right">${formatQt(r.totalWeight)}</td>
          <td class="right">${formatINR(r.totalSaleValue)}</td>
          <td class="right ${r.totalMargin >= 0 ? 'green' : 'red'}">${formatINR(r.totalMargin)}</td>
          <td class="right green">${formatINR(r.totalReceived)}</td>
          <td class="right ${r.outstanding > 0 ? 'red' : 'green'}">${formatINR(r.outstanding)}</td>
        </tr>`).join('')}
      </tbody>
      <tfoot><tr>
        <td><b>Total</b></td>
        <td class="right">${rows.reduce((s, r) => s + r.deliveryCount, 0)}</td>
        <td class="right">${formatQt(rows.reduce((s, r) => s + r.totalWeight, 0))}</td>
        <td class="right">${formatINR(totalSale)}</td>
        <td class="right green">${formatINR(rows.reduce((s, r) => s + r.totalMargin, 0))}</td>
        <td class="right green">${formatINR(totalReceived)}</td>
        <td class="right red">${formatINR(totalOutstanding)}</td>
      </tr></tfoot>
    </table>
    ${receipts.length > 0 ? `
      <div class="section-title">Receipt History</div>
      <table>
        <thead><tr><th>Receipt No.</th><th>Date</th><th>Customer</th><th class="right">Amount</th><th>Notes</th></tr></thead>
        <tbody>
          ${receipts.map((r: any) => `<tr>
            <td>${r.receiptNumber}</td>
            <td>${dayjs(r.receiptDate).format('DD/MM/YYYY')}</td>
            <td>${r.customer?.name || '-'}</td>
            <td class="right green"><b>${formatINR(r.amount)}</b></td>
            <td>${r.notes || '-'}</td>
          </tr>`).join('')}
        </tbody>
      </table>` : ''}`

  return (
    <div>
      <Space wrap style={{ marginBottom: 16 }}>
        <DateFilter onChange={(f, t) => { setFrom(f); setTo(t) }} />
        <Select placeholder="All Customers" allowClear showSearch optionFilterProp="label" style={{ width: 200 }}
          options={customers.map((c: any) => ({ value: c.id, label: c.name }))}
          onChange={v => setCustomerId(v ?? null)} />
        <Button icon={<FilePdfOutlined />} onClick={() => {
          const tmp = document.createElement('div')
          tmp.id = '__cust_pdf__'
          tmp.style.display = 'none'
          tmp.innerHTML = pdfContent()
          document.body.appendChild(tmp)
          exportToPDF('Customer-wise Report', `${filterLabel} | ${dateLabel}`, '__cust_pdf__')
          setTimeout(() => document.body.removeChild(tmp), 1000)
        }}>Export PDF</Button>
      </Space>

      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        <Col xs={12} sm={8}><SummaryCard title="Total Sale Value" value={formatINR(totalSale)} prefix={<UserOutlined />} /></Col>
        <Col xs={12} sm={8}><SummaryCard title="Total Received" value={formatINR(totalReceived)} color="#2e7d32" prefix={<ArrowUpOutlined />} /></Col>
        <Col xs={12} sm={8}><SummaryCard title="Total Outstanding" value={formatINR(totalOutstanding)} color="#cf1322" prefix={<ArrowDownOutlined />} /></Col>
      </Row>

      <Table dataSource={rows} columns={summaryColumns} rowKey="customerId" loading={isLoading} size="small"
        scroll={{ x: 800 }} pagination={false}
        summary={rows.length > 1 ? () => (
          <Table.Summary.Row style={{ fontWeight: 600, background: '#fafafa' }}>
            <Table.Summary.Cell index={0}>Total</Table.Summary.Cell>
            <Table.Summary.Cell index={1} align="right">{rows.reduce((s, r) => s + r.deliveryCount, 0)}</Table.Summary.Cell>
            <Table.Summary.Cell index={2} align="right">{formatQt(rows.reduce((s, r) => s + r.totalWeight, 0))}</Table.Summary.Cell>
            <Table.Summary.Cell index={3} align="right">{formatINR(totalSale)}</Table.Summary.Cell>
            <Table.Summary.Cell index={4} align="right"><span style={{ color: '#2e7d32' }}>{formatINR(rows.reduce((s, r) => s + r.totalMargin, 0))}</span></Table.Summary.Cell>
            <Table.Summary.Cell index={5} align="right"><span style={{ color: '#2e7d32' }}>{formatINR(totalReceived)}</span></Table.Summary.Cell>
            <Table.Summary.Cell index={6} align="right"><span style={{ color: '#cf1322' }}>{formatINR(totalOutstanding)}</span></Table.Summary.Cell>
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
  const pParams: any = {}
  if (from) pParams.from = from
  if (to) pParams.to = to
  const { data, isLoading } = usePaymentsReport(pParams)

  const payments: any[] = data?.payments || []
  const receipts: any[] = data?.receipts || []
  const cashFlow: any[] = data?.dailyCashFlow || []

  const nw = { onCell: () => ({ style: { whiteSpace: 'nowrap' as const } }) }

  const paymentColumns = [
    { title: 'Payment No.', dataIndex: 'paymentNumber', key: 'pn', width: 110, ...nw },
    { title: 'Date', dataIndex: 'paymentDate', key: 'date', width: 90, ...nw, render: (v: string) => dayjs(v).format('DD/MM/YYYY') },
    { title: 'Supplier', dataIndex: ['supplier', 'name'], key: 'supplier', ...nw },
    { title: 'Amount', dataIndex: 'amount', key: 'amt', width: 120, align: 'right' as const, ...nw, render: (v: number) => <b style={{ color: '#cf1322' }}>{formatINR(v)}</b> },
    { title: 'Notes', dataIndex: 'notes', key: 'notes', ellipsis: true },
  ]

  const receiptColumns = [
    { title: 'Receipt No.', dataIndex: 'receiptNumber', key: 'rn', width: 110, ...nw },
    { title: 'Date', dataIndex: 'receiptDate', key: 'date', width: 90, ...nw, render: (v: string) => dayjs(v).format('DD/MM/YYYY') },
    { title: 'Customer', dataIndex: ['customer', 'name'], key: 'customer', ...nw },
    { title: 'Amount', dataIndex: 'amount', key: 'amt', width: 120, align: 'right' as const, ...nw, render: (v: number) => <b style={{ color: '#2e7d32' }}>{formatINR(v)}</b> },
    { title: 'Notes', dataIndex: 'notes', key: 'notes', ellipsis: true },
  ]

  const cashFlowColumns = [
    { title: 'Date', dataIndex: 'date', key: 'date', width: 120, ...nw, render: (v: string) => dayjs(v).format('DD MMM YYYY') },
    { title: 'Paid Out (Suppliers)', dataIndex: 'paid', key: 'paid', align: 'right' as const, ...nw, render: (v: number) => v > 0 ? <span style={{ color: '#cf1322' }}>{formatINR(v)}</span> : '-' },
    { title: 'Received (Customers)', dataIndex: 'received', key: 'received', align: 'right' as const, ...nw, render: (v: number) => v > 0 ? <span style={{ color: '#2e7d32' }}>{formatINR(v)}</span> : '-' },
    {
      title: 'Net', key: 'net', width: 120, align: 'right' as const, ...nw,
      render: (_: any, r: any) => {
        const net = r.received - r.paid
        return <b style={{ color: net >= 0 ? '#2e7d32' : '#cf1322' }}>{formatINR(net)}</b>
      }
    },
  ]

  const dateLabel = from && to ? `${dayjs(from).format('DD MMM YYYY')} to${dayjs(to).format('DD MMM YYYY')}` : 'All dates'

  const pdfContent = () => `
    <div class="summary-grid" style="grid-template-columns:repeat(3,1fr)">
      <div class="summary-card"><div class="label">Supplier Payments</div><div class="value red">${formatINR(data?.totalPaid ?? 0)}</div></div>
      <div class="summary-card"><div class="label">Customer Receipts</div><div class="value green">${formatINR(data?.totalReceived ?? 0)}</div></div>
      <div class="summary-card"><div class="label">Net Cash Flow</div><div class="value ${(data?.netCashFlow ?? 0) >= 0 ? 'green' : 'red'}">${formatINR(data?.netCashFlow ?? 0)}</div></div>
    </div>
    <div class="section-title">Daily Cash Flow</div>
    <table>
      <thead><tr><th>Date</th><th class="right">Paid Out</th><th class="right">Received</th><th class="right">Net</th></tr></thead>
      <tbody>
        ${cashFlow.map((r: any) => { const net = r.received - r.paid; return `<tr>
          <td>${dayjs(r.date).format('DD MMM YYYY')}</td>
          <td class="right ${r.paid > 0 ? 'red' : ''}">${r.paid > 0 ? formatINR(r.paid) : '-'}</td>
          <td class="right ${r.received > 0 ? 'green' : ''}">${r.received > 0 ? formatINR(r.received) : '-'}</td>
          <td class="right ${net >= 0 ? 'green' : 'red'}"><b>${formatINR(net)}</b></td>
        </tr>` }).join('')}
      </tbody>
    </table>
    <div class="section-title">Supplier Payments (${payments.length})</div>
    <table>
      <thead><tr><th>Payment No.</th><th>Date</th><th>Supplier</th><th class="right">Amount</th><th>Notes</th></tr></thead>
      <tbody>
        ${payments.map((p: any) => `<tr>
          <td>${p.paymentNumber}</td><td>${dayjs(p.paymentDate).format('DD/MM/YYYY')}</td>
          <td>${p.supplier?.name || '-'}</td><td class="right red"><b>${formatINR(p.amount)}</b></td><td>${p.notes || '-'}</td>
        </tr>`).join('')}
      </tbody>
    </table>
    <div class="section-title">Customer Receipts (${receipts.length})</div>
    <table>
      <thead><tr><th>Receipt No.</th><th>Date</th><th>Customer</th><th class="right">Amount</th><th>Notes</th></tr></thead>
      <tbody>
        ${receipts.map((r: any) => `<tr>
          <td>${r.receiptNumber}</td><td>${dayjs(r.receiptDate).format('DD/MM/YYYY')}</td>
          <td>${r.customer?.name || '-'}</td><td class="right green"><b>${formatINR(r.amount)}</b></td><td>${r.notes || '-'}</td>
        </tr>`).join('')}
      </tbody>
    </table>`

  return (
    <div>
      <Space wrap style={{ marginBottom: 16 }}>
        <DateFilter onChange={(f, t) => { setFrom(f); setTo(t) }} />
        <Button icon={<FilePdfOutlined />} onClick={() => {
          const tmp = document.createElement('div')
          tmp.id = '__pay_pdf__'
          tmp.style.display = 'none'
          tmp.innerHTML = pdfContent()
          document.body.appendChild(tmp)
          exportToPDF('Payments & Cash Flow Report', dateLabel, '__pay_pdf__')
          setTimeout(() => document.body.removeChild(tmp), 1000)
        }}>Export PDF</Button>
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
                <Table.Summary.Cell index={1} align="right"><span style={{ color: '#cf1322' }}>{formatINR(data?.totalPaid ?? 0)}</span></Table.Summary.Cell>
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
                <Table.Summary.Cell index={1} align="right"><span style={{ color: '#2e7d32' }}>{formatINR(data?.totalReceived ?? 0)}</span></Table.Summary.Cell>
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
    { title: 'Total Weight (Qt)', dataIndex: 'totalWeight', key: 'wt', align: 'right' as const, render: formatQt },
    { title: 'Total Purchase', dataIndex: 'totalPurchase', key: 'tp', align: 'right' as const, render: (v: number) => formatINR(v) },
    { title: 'Total Sale', dataIndex: 'totalSale', key: 'ts', align: 'right' as const, render: (v: number) => v ? formatINR(v) : '-' },
    {
      title: 'Margin', key: 'margin', align: 'right' as const,
      render: (_: any, r: any) => {
        const m = r.totalSale - r.totalPurchase
        return r.totalSale ? <b style={{ color: m >= 0 ? '#2e7d32' : '#cf1322' }}>{formatINR(m)}</b> : '-'
      }
    },
  ]

  const totalWeight = stock.reduce((s: number, r: any) => s + r.totalWeight, 0)
  const totalPurchase = stock.reduce((s: number, r: any) => s + r.totalPurchase, 0)
  const totalSale = stock.reduce((s: number, r: any) => s + r.totalSale, 0)

  const pdfContent = () => `
    <div class="summary-grid" style="grid-template-columns:repeat(3,1fr)">
      <div class="summary-card"><div class="label">Total Weight</div><div class="value">${formatQt(totalWeight)}</div></div>
      <div class="summary-card"><div class="label">Total Purchase</div><div class="value">${formatINR(totalPurchase)}</div></div>
      <div class="summary-card"><div class="label">Total Sale</div><div class="value green">${formatINR(totalSale)}</div></div>
    </div>
    <table>
      <thead><tr>
        <th>Commodity</th><th class="right">Total Weight (Qt)</th>
        <th class="right">Total Purchase</th><th class="right">Total Sale</th><th class="right">Margin</th>
      </tr></thead>
      <tbody>
        ${stock.map((r: any) => { const m = r.totalSale - r.totalPurchase; return `<tr>
          <td><b>${r.name}</b></td>
          <td class="right">${formatQt(r.totalWeight)}</td>
          <td class="right">${formatINR(r.totalPurchase)}</td>
          <td class="right">${r.totalSale ? formatINR(r.totalSale) : '-'}</td>
          <td class="right ${r.totalSale ? (m >= 0 ? 'green' : 'red') : ''}">${r.totalSale ? formatINR(m) : '-'}</td>
        </tr>` }).join('')}
      </tbody>
      <tfoot><tr>
        <td><b>Total</b></td>
        <td class="right">${formatQt(totalWeight)}</td>
        <td class="right">${formatINR(totalPurchase)}</td>
        <td class="right">${formatINR(totalSale)}</td>
        <td class="right ${(totalSale - totalPurchase) >= 0 ? 'green' : 'red'}">${formatINR(totalSale - totalPurchase)}</td>
      </tr></tfoot>
    </table>`

  return (
    <div>
      <Space wrap style={{ marginBottom: 16 }}>
        <Button icon={<FilePdfOutlined />} onClick={() => {
          const tmp = document.createElement('div')
          tmp.id = '__stock_pdf__'
          tmp.style.display = 'none'
          tmp.innerHTML = pdfContent()
          document.body.appendChild(tmp)
          exportToPDF('Commodity Summary Report', `As of ${dayjs().format('DD MMM YYYY')}`, '__stock_pdf__')
          setTimeout(() => document.body.removeChild(tmp), 1000)
        }}>Export PDF</Button>
      </Space>
      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        <Col xs={12} sm={8}><SummaryCard title="Total Weight" value={formatQt(totalWeight)} prefix={<CarOutlined />} /></Col>
        <Col xs={12} sm={8}><SummaryCard title="Total Purchase" value={formatINR(totalPurchase)} /></Col>
        <Col xs={12} sm={8}><SummaryCard title="Total Sale" value={formatINR(totalSale)} color="#2e7d32" /></Col>
      </Row>
      <Table dataSource={stock} columns={columns} rowKey="commodityId" loading={isLoading} size="small" pagination={false}
        summary={stock.length > 1 ? () => (
          <Table.Summary.Row style={{ fontWeight: 600, background: '#fafafa' }}>
            <Table.Summary.Cell index={0}>Total</Table.Summary.Cell>
            <Table.Summary.Cell index={1} align="right">{formatQt(totalWeight)}</Table.Summary.Cell>
            <Table.Summary.Cell index={2} align="right">{formatINR(totalPurchase)}</Table.Summary.Cell>
            <Table.Summary.Cell index={3} align="right">{formatINR(totalSale)}</Table.Summary.Cell>
            <Table.Summary.Cell index={4} align="right">
              <span style={{ color: (totalSale - totalPurchase) >= 0 ? '#2e7d32' : '#cf1322', fontWeight: 600 }}>{formatINR(totalSale - totalPurchase)}</span>
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
      <div className="page-header">
        <div>
          <Typography.Title level={4} className="page-title">Reports</Typography.Title>
          <div className="page-subtitle">P&L, supplier/customer statements, cash flow, commodity summary</div>
        </div>
      </div>
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
