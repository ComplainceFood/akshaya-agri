import { useMemo, useState } from 'react'
import {
  Tabs, Table, Button, Modal, Form, Input, InputNumber, Select,
  DatePicker, Typography, message, Card, Statistic, Row, Col, Tag,
  Space, Divider, Popconfirm,
} from 'antd'
import {
  PlusOutlined, FilePdfOutlined, FileExcelOutlined,
  ArrowUpOutlined, ArrowDownOutlined, DeleteOutlined, EditOutlined,
  BookOutlined, SearchOutlined,
} from '@ant-design/icons'
import { useLedgerSummary, useCreateLedgerEntry, useDeleteLedgerEntry, useUpdateLedgerEntry } from '../../api/hooks'
import { formatINR } from '../../utils/format'
import { BRAND, brandPrintHeader, BRAND_PRINT_CSS, getLogoDataUri } from '../../utils/brand'
import dayjs, { type Dayjs } from 'dayjs'
import quarterOfYear from 'dayjs/plugin/quarterOfYear'
dayjs.extend(quarterOfYear)
import * as XLSX from 'xlsx'
import ImportBankStatement from '../payments/ImportBankStatement'

const { Title, Text } = Typography
const { RangePicker } = DatePicker

const CATEGORIES = [
  'BANK_TRANSFER', 'CASH', 'EXPENSE', 'INCOME', 'TAX', 'CESS', 'ADJUSTMENT', 'OTHER',
].map(v => ({ value: v, label: v.replace('_', ' ') }))

const catColor: Record<string, string> = {
  BANK_TRANSFER: 'blue', CASH: 'green', EXPENSE: 'red', INCOME: 'cyan',
  TAX: 'orange', CESS: 'purple', ADJUSTMENT: 'gold', OTHER: 'default',
}

function pdfStyles() {
  return `
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, sans-serif; font-size: 11px; color: #222; background: #fff; padding: 24px 32px; }
    ${BRAND_PRINT_CSS}
    .pdf-title { font-size: 14px; font-weight: 700; color: #333; margin-bottom: 2px; }
    .pdf-subtitle { font-size: 10px; color: #666; margin-bottom: 14px; }
    .summary-grid { display: grid; gap: 10px; margin-bottom: 16px; }
    .summary-card { border: 1px solid #e0e0e0; border-radius: 6px; padding: 10px 12px; background: #fafafa; }
    .summary-card .label { font-size: 10px; color: #888; margin-bottom: 3px; }
    .summary-card .value { font-size: 13px; font-weight: 700; color: #222; }
    table { width: 100%; border-collapse: collapse; font-size: 10px; }
    thead tr { background: ${BRAND.primary}; color: #fff; }
    thead th { padding: 6px 8px; text-align: left; font-weight: 600; white-space: nowrap; }
    thead th.right { text-align: right; }
    tbody tr:nth-child(even) { background: #f5f9f5; }
    tbody td { padding: 5px 8px; border-bottom: 1px solid #e8e8e8; white-space: nowrap; }
    tbody td.right { text-align: right; }
    tfoot tr { background: #e8f5e9; font-weight: 700; }
    tfoot td { padding: 6px 8px; border-top: 2px solid ${BRAND.primary}; white-space: nowrap; }
    tfoot td.right { text-align: right; }
    .green { color: ${BRAND.primary}; } .red { color: #c62828; }
    .section-title { font-size: 11px; font-weight: 700; color: ${BRAND.primary}; border-bottom: 1px solid #c8e6c9; padding-bottom: 4px; margin: 16px 0 8px; }
    .pdf-footer { margin-top: 24px; border-top: 1px solid #e0e0e0; padding-top: 8px; font-size: 9px; color: #aaa; display: flex; justify-content: space-between; }
  `
}

async function openPrint(title: string, subtitle: string, body: string) {
  const w = window.open('', '_blank')
  if (!w) return
  const logoDataUri = await getLogoDataUri()
  const header = brandPrintHeader({
    logoDataUri,
    rightHtml: `<div>Generated: ${dayjs().format('DD MMM YYYY, h:mm A')}</div><div>For Tax Audit / CA Review</div>`,
  })
  w.document.open()
  w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"/><title>${title}</title><style>${pdfStyles()}</style></head><body>
    ${header}
    <div class="pdf-title">${title}</div>
    <div class="pdf-subtitle">${subtitle}</div>
    ${body}
    <div class="pdf-footer"><span>${BRAND.name} | Confidential — Tax Audit Document</span><span>Printed: ${dayjs().format('DD/MM/YYYY')}</span></div>
  </body></html>`)
  w.document.close()
  setTimeout(() => w.print(), 400)
}

// ── Summary Cards ─────────────────────────────────────────────────────────────
function SummaryCards({ data }: { data: any }) {
  const s = data?.summary
  if (!s) return null
  const marginColor = s.grossMargin >= 0 ? '#2e7d32' : '#cf1322'
  return (
    <Row gutter={[12, 12]} style={{ marginBottom: 20 }}>
      {[
        { title: 'Total Sales (Invoiced)', value: formatINR(s.totalSales), color: '#2e7d32', prefix: <ArrowUpOutlined /> },
        { title: 'Total Purchases', value: formatINR(s.totalPurchases), color: '#cf1322', prefix: <ArrowDownOutlined /> },
        { title: 'Gross Margin', value: `${formatINR(s.grossMargin)} (${s.grossMarginPct?.toFixed(1)}%)`, color: marginColor },
        { title: 'Total Cess Paid', value: formatINR(s.totalCess), color: '#8f4e00' },
        { title: 'Supplier Outstanding', value: formatINR(s.supplierOutstanding), color: s.supplierOutstanding > 0 ? '#cf1322' : '#2e7d32' },
        { title: 'Customer Outstanding', value: formatINR(s.customerOutstanding), color: s.customerOutstanding > 0 ? '#cf1322' : '#2e7d32' },
      ].map(c => (
        <Col xs={12} sm={8} md={4} key={c.title}>
          <Card size="small" className="stat-card">
            <Statistic title={c.title} value={c.value} prefix={c.prefix} valueStyle={{ color: c.color, fontSize: 13 }} />
          </Card>
        </Col>
      ))}
    </Row>
  )
}

// ── Sales Tab ─────────────────────────────────────────────────────────────────
function SalesTab({ data }: { data: any }) {
  const [search, setSearch] = useState('')
  const allRows = useMemo(
    () => (data?.deliveries || []).filter((d: any) => Number(d.saleValue ?? 0) > 0),
    [data]
  )
  const rows = useMemo(() => {
    if (!search.trim()) return allRows
    const q = search.toLowerCase()
    return allRows.filter((r: any) =>
      (r.customer?.name ?? '').toLowerCase().includes(q) ||
      (r.commodity?.name ?? '').toLowerCase().includes(q) ||
      (r.lrNumber ?? '').toLowerCase().includes(q) ||
      (r.deliveryNumber ?? '').toLowerCase().includes(q)
    )
  }, [allRows, search])
  const nowrap = { onCell: () => ({ style: { whiteSpace: 'nowrap' as const } }) }
  const cols = [
    { title: 'Date', dataIndex: 'deliveryDate', key: 'date', width: 90, ...nowrap, render: (v: string) => dayjs(v).format('DD/MM/YY') },
    { title: 'LR / Slip', key: 'lr', width: 100, ...nowrap, render: (_: any, r: any) => r.lrNumber || r.deliveryNumber },
    { title: 'Customer', dataIndex: ['customer', 'name'], key: 'cust', ellipsis: true, width: 150 },
    { title: 'Commodity', dataIndex: ['commodity', 'name'], key: 'com', width: 110, ellipsis: true },
    { title: 'HSN', dataIndex: ['commodity', 'hsnCode'], key: 'hsn', width: 80, ...nowrap },
    { title: 'Wt (Kg)', dataIndex: 'adjustedWeight', key: 'wt', width: 90, align: 'right' as const, ...nowrap, render: (v: number) => v ? Number(v).toLocaleString('en-IN', { maximumFractionDigits: 1 }) : '-' },
    { title: '₹/Kg', dataIndex: 'saleRate', key: 'rate', width: 80, align: 'right' as const, ...nowrap, render: (v: number) => v ? Number(v).toLocaleString('en-IN', { maximumFractionDigits: 4 }) : '-' },
    { title: 'Sale Value', dataIndex: 'saleValue', key: 'sv', width: 120, align: 'right' as const, ...nowrap, render: (v: number) => formatINR(v) },
    { title: 'Cess', dataIndex: 'cessPaid', key: 'cess', width: 90, align: 'right' as const, ...nowrap, render: (v: number) => v ? formatINR(v) : '-' },
  ]
  const totalSale = rows.reduce((s: number, r: any) => s + Number(r.saleValue ?? 0), 0)
  const totalCess = rows.reduce((s: number, r: any) => s + Number(r.cessPaid ?? 0), 0)

  function exportExcel() {
    const wsData = [
      ['Date', 'LR/Slip', 'Customer', 'Commodity', 'HSN', 'Wt (Kg)', '₹/Kg', 'Sale Value', 'Cess'],
      ...rows.map((r: any) => [
        dayjs(r.deliveryDate).format('DD/MM/YYYY'),
        r.lrNumber || r.deliveryNumber,
        r.customer?.name,
        r.commodity?.name,
        r.commodity?.hsnCode,
        Number(r.adjustedWeight ?? 0).toFixed(1),
        r.saleRate,
        Number(r.saleValue ?? 0),
        Number(r.cessPaid ?? 0),
      ]),
      ['', '', '', '', '', '', 'TOTAL', totalSale, totalCess],
    ]
    const ws = XLSX.utils.aoa_to_sheet(wsData)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Sales Ledger')
    XLSX.writeFile(wb, `sales-ledger-${dayjs().format('YYYY-MM-DD')}.xlsx`)
  }

  function printPDF() {
    const body = `
      <div class="summary-grid" style="grid-template-columns:repeat(3,1fr)">
        <div class="summary-card"><div class="label">Transactions</div><div class="value">${rows.length}</div></div>
        <div class="summary-card"><div class="label">Total Sale Value</div><div class="value green">${formatINR(totalSale)}</div></div>
        <div class="summary-card"><div class="label">Total Cess</div><div class="value">${formatINR(totalCess)}</div></div>
      </div>
      <table>
        <thead><tr><th>Date</th><th>LR/Slip</th><th>Customer</th><th>Commodity</th><th>HSN</th><th class="right">Wt(Kg)</th><th class="right">₹/Kg</th><th class="right">Sale Value</th><th class="right">Cess</th></tr></thead>
        <tbody>${rows.map((r: any) => `<tr>
          <td>${dayjs(r.deliveryDate).format('DD/MM/YY')}</td>
          <td>${r.lrNumber || r.deliveryNumber || '-'}</td>
          <td>${r.customer?.name || '-'}</td>
          <td>${r.commodity?.name || '-'}</td>
          <td>${r.commodity?.hsnCode || '-'}</td>
          <td class="right">${Number(r.adjustedWeight ?? 0).toFixed(1)}</td>
          <td class="right">${r.saleRate ? Number(r.saleRate).toLocaleString('en-IN', { maximumFractionDigits: 4 }) : '-'}</td>
          <td class="right">${formatINR(r.saleValue)}</td>
          <td class="right">${r.cessPaid ? formatINR(r.cessPaid) : '-'}</td>
        </tr>`).join('')}</tbody>
        <tfoot><tr><td colspan="7">TOTAL</td><td class="right">${formatINR(totalSale)}</td><td class="right">${formatINR(totalCess)}</td></tr></tfoot>
      </table>`
    openPrint('Sales Ledger', `${rows.length} transactions`, body)
  }

  return (
    <>
      <Space style={{ marginBottom: 12 }} wrap>
        <Input
          allowClear
          prefix={<SearchOutlined />}
          placeholder="Search customer, commodity, slip…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ width: 280 }}
        />
        <Button icon={<FilePdfOutlined />} onClick={printPDF}>Print / PDF</Button>
        <Button icon={<FileExcelOutlined />} onClick={exportExcel}>Export Excel</Button>
      </Space>
      <Table dataSource={rows} columns={cols} rowKey="id" size="small" scroll={{ x: 900 }}
        pagination={{ pageSize: 50, showTotal: (t) => `${t} records` }}
        summary={() => (
          <Table.Summary.Row style={{ fontWeight: 700 }}>
            <Table.Summary.Cell index={0} colSpan={7}>Total</Table.Summary.Cell>
            <Table.Summary.Cell index={7} align="right">{formatINR(totalSale)}</Table.Summary.Cell>
            <Table.Summary.Cell index={8} align="right">{formatINR(totalCess)}</Table.Summary.Cell>
          </Table.Summary.Row>
        )}
      />
    </>
  )
}

// ── Purchases Tab ─────────────────────────────────────────────────────────────
function PurchasesTab({ data }: { data: any }) {
  const [search, setSearch] = useState('')
  const allRows = useMemo(() => data?.deliveries || [], [data])
  const rows = useMemo(() => {
    if (!search.trim()) return allRows
    const q = search.toLowerCase()
    return allRows.filter((r: any) =>
      (r.supplier?.name ?? '').toLowerCase().includes(q) ||
      (r.commodity?.name ?? '').toLowerCase().includes(q) ||
      (r.deliveryNumber ?? '').toLowerCase().includes(q)
    )
  }, [allRows, search])
  const nowrap = { onCell: () => ({ style: { whiteSpace: 'nowrap' as const } }) }
  const cols = [
    { title: 'Date', dataIndex: 'deliveryDate', key: 'date', width: 90, ...nowrap, render: (v: string) => dayjs(v).format('DD/MM/YY') },
    { title: 'Delivery No.', dataIndex: 'deliveryNumber', key: 'dn', width: 110, ...nowrap },
    { title: 'Supplier', dataIndex: ['supplier', 'name'], key: 'sup', ellipsis: true, width: 150 },
    { title: 'Commodity', dataIndex: ['commodity', 'name'], key: 'com', width: 110, ellipsis: true },
    { title: 'HSN', dataIndex: ['commodity', 'hsnCode'], key: 'hsn', width: 80, ...nowrap },
    { title: 'Wt (Kg)', dataIndex: 'adjustedWeight', key: 'wt', width: 90, align: 'right' as const, ...nowrap, render: (v: number) => v ? Number(v).toLocaleString('en-IN', { maximumFractionDigits: 1 }) : '-' },
    { title: '₹/Kg', dataIndex: 'purchaseRate', key: 'rate', width: 80, align: 'right' as const, ...nowrap, render: (v: number) => v ? Number(v).toLocaleString('en-IN', { maximumFractionDigits: 4 }) : '-' },
    { title: 'Purchase Value', dataIndex: 'purchaseValue', key: 'pv', width: 130, align: 'right' as const, ...nowrap, render: (v: number) => formatINR(v) },
    { title: 'Net Payable', dataIndex: 'netPayable', key: 'np', width: 120, align: 'right' as const, ...nowrap, render: (v: number) => v ? formatINR(v) : '-' },
  ]
  const totalPurchase = rows.reduce((s: number, r: any) => s + Number(r.purchaseValue ?? 0), 0)
  const totalNetPayable = rows.reduce((s: number, r: any) => s + Number(r.netPayable ?? 0), 0)

  function exportExcel() {
    const wsData = [
      ['Date', 'Delivery No.', 'Supplier', 'Commodity', 'HSN', 'Wt (Kg)', '₹/Kg', 'Purchase Value', 'Net Payable'],
      ...rows.map((r: any) => [
        dayjs(r.deliveryDate).format('DD/MM/YYYY'),
        r.deliveryNumber,
        r.supplier?.name,
        r.commodity?.name,
        r.commodity?.hsnCode,
        Number(r.adjustedWeight ?? 0).toFixed(1),
        r.purchaseRate,
        Number(r.purchaseValue ?? 0),
        Number(r.netPayable ?? 0),
      ]),
      ['', '', '', '', '', '', 'TOTAL', totalPurchase, totalNetPayable],
    ]
    const ws = XLSX.utils.aoa_to_sheet(wsData)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Purchase Ledger')
    XLSX.writeFile(wb, `purchase-ledger-${dayjs().format('YYYY-MM-DD')}.xlsx`)
  }

  function printPDF() {
    const body = `
      <div class="summary-grid" style="grid-template-columns:repeat(3,1fr)">
        <div class="summary-card"><div class="label">Transactions</div><div class="value">${rows.length}</div></div>
        <div class="summary-card"><div class="label">Total Purchase Value</div><div class="value red">${formatINR(totalPurchase)}</div></div>
        <div class="summary-card"><div class="label">Total Net Payable</div><div class="value">${formatINR(totalNetPayable)}</div></div>
      </div>
      <table>
        <thead><tr><th>Date</th><th>Delivery No.</th><th>Supplier</th><th>Commodity</th><th>HSN</th><th class="right">Wt(Kg)</th><th class="right">₹/Kg</th><th class="right">Purchase Value</th><th class="right">Net Payable</th></tr></thead>
        <tbody>${rows.map((r: any) => `<tr>
          <td>${dayjs(r.deliveryDate).format('DD/MM/YY')}</td>
          <td>${r.deliveryNumber || '-'}</td>
          <td>${r.supplier?.name || '-'}</td>
          <td>${r.commodity?.name || '-'}</td>
          <td>${r.commodity?.hsnCode || '-'}</td>
          <td class="right">${Number(r.adjustedWeight ?? 0).toFixed(1)}</td>
          <td class="right">${r.purchaseRate ? Number(r.purchaseRate).toLocaleString('en-IN', { maximumFractionDigits: 4 }) : '-'}</td>
          <td class="right">${formatINR(r.purchaseValue)}</td>
          <td class="right">${r.netPayable ? formatINR(r.netPayable) : '-'}</td>
        </tr>`).join('')}</tbody>
        <tfoot><tr><td colspan="7">TOTAL</td><td class="right">${formatINR(totalPurchase)}</td><td class="right">${formatINR(totalNetPayable)}</td></tr></tfoot>
      </table>`
    openPrint('Purchase Ledger', `${rows.length} transactions`, body)
  }

  return (
    <>
      <Space style={{ marginBottom: 12 }} wrap>
        <Input
          allowClear
          prefix={<SearchOutlined />}
          placeholder="Search supplier, commodity, delivery no…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ width: 280 }}
        />
        <Button icon={<FilePdfOutlined />} onClick={printPDF}>Print / PDF</Button>
        <Button icon={<FileExcelOutlined />} onClick={exportExcel}>Export Excel</Button>
      </Space>
      <Table dataSource={rows} columns={cols} rowKey="id" size="small" scroll={{ x: 900 }}
        pagination={{ pageSize: 50, showTotal: (t) => `${t} records` }}
        summary={() => (
          <Table.Summary.Row style={{ fontWeight: 700 }}>
            <Table.Summary.Cell index={0} colSpan={7}>Total</Table.Summary.Cell>
            <Table.Summary.Cell index={7} align="right">{formatINR(totalPurchase)}</Table.Summary.Cell>
            <Table.Summary.Cell index={8} align="right">{formatINR(totalNetPayable)}</Table.Summary.Cell>
          </Table.Summary.Row>
        )}
      />
    </>
  )
}

// ── Payments Tab ──────────────────────────────────────────────────────────────
function PaymentsTab({ data }: { data: any }) {
  const [search, setSearch] = useState('')
  const allPayments = data?.supplierPayments || []
  const allReceipts = data?.customerReceipts || []
  const q = search.trim().toLowerCase()
  const payments = q
    ? allPayments.filter((p: any) =>
        (p.supplier?.name ?? '').toLowerCase().includes(q) ||
        (p.paymentNumber ?? '').toLowerCase().includes(q) ||
        (p.referenceNumber ?? '').toLowerCase().includes(q))
    : allPayments
  const receipts = q
    ? allReceipts.filter((r: any) =>
        (r.customer?.name ?? '').toLowerCase().includes(q) ||
        (r.receiptNumber ?? '').toLowerCase().includes(q) ||
        (r.referenceNumber ?? '').toLowerCase().includes(q))
    : allReceipts
  const nowrap = { onCell: () => ({ style: { whiteSpace: 'nowrap' as const } }) }

  const paymentCols = [
    { title: 'Date', dataIndex: 'paymentDate', key: 'date', width: 90, ...nowrap, render: (v: string) => dayjs(v).format('DD/MM/YY') },
    { title: 'Ref #', dataIndex: 'paymentNumber', key: 'num', width: 110, ...nowrap },
    { title: 'Supplier', dataIndex: ['supplier', 'name'], key: 'sup', ellipsis: true },
    { title: 'Mode', dataIndex: 'paymentMode', key: 'mode', width: 80, render: (v: string) => v ? <Tag color="blue">{v}</Tag> : '-' },
    { title: 'UTR / Ref', dataIndex: 'referenceNumber', key: 'ref', width: 130, ...nowrap },
    { title: 'Amount', dataIndex: 'amount', key: 'amt', width: 130, align: 'right' as const, ...nowrap, render: (v: number) => <span style={{ color: '#cf1322', fontWeight: 600 }}>{formatINR(v)}</span> },
  ]
  const receiptCols = [
    { title: 'Date', dataIndex: 'receiptDate', key: 'date', width: 90, ...nowrap, render: (v: string) => dayjs(v).format('DD/MM/YY') },
    { title: 'Ref #', dataIndex: 'receiptNumber', key: 'num', width: 110, ...nowrap },
    { title: 'Customer', dataIndex: ['customer', 'name'], key: 'cust', ellipsis: true },
    { title: 'Mode', dataIndex: 'paymentMode', key: 'mode', width: 80, render: (v: string) => v ? <Tag color="green">{v}</Tag> : '-' },
    { title: 'UTR / Ref', dataIndex: 'referenceNumber', key: 'ref', width: 130, ...nowrap },
    { title: 'Amount', dataIndex: 'amount', key: 'amt', width: 130, align: 'right' as const, ...nowrap, render: (v: number) => <span style={{ color: '#2e7d32', fontWeight: 600 }}>{formatINR(v)}</span> },
  ]

  const totalPaid = payments.reduce((s: number, p: any) => s + Number(p.amount), 0)
  const totalReceived = receipts.reduce((s: number, r: any) => s + Number(r.amount), 0)

  function exportExcel() {
    const payRows = [
      ['SUPPLIER PAYMENTS'],
      ['Date', 'Ref #', 'Supplier', 'Mode', 'UTR/Ref', 'Amount'],
      ...payments.map((p: any) => [dayjs(p.paymentDate).format('DD/MM/YYYY'), p.paymentNumber, p.supplier?.name, p.paymentMode, p.referenceNumber, Number(p.amount)]),
      ['', '', '', '', 'TOTAL', totalPaid],
      [],
      ['CUSTOMER RECEIPTS'],
      ['Date', 'Ref #', 'Customer', 'Mode', 'UTR/Ref', 'Amount'],
      ...receipts.map((r: any) => [dayjs(r.receiptDate).format('DD/MM/YYYY'), r.receiptNumber, r.customer?.name, r.paymentMode, r.referenceNumber, Number(r.amount)]),
      ['', '', '', '', 'TOTAL', totalReceived],
    ]
    const ws = XLSX.utils.aoa_to_sheet(payRows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Payments')
    XLSX.writeFile(wb, `payments-ledger-${dayjs().format('YYYY-MM-DD')}.xlsx`)
  }

  return (
    <>
      <Space style={{ marginBottom: 12 }} wrap>
        <Input
          allowClear
          prefix={<SearchOutlined />}
          placeholder="Search supplier/customer, UTR, ref…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ width: 280 }}
        />
        <Button icon={<FileExcelOutlined />} onClick={exportExcel}>Export Excel</Button>
      </Space>
      <Row gutter={[12, 0]} style={{ marginBottom: 12 }}>
        <Col span={12}><Card size="small" className="stat-card"><Statistic title="Total Paid to Suppliers" value={formatINR(totalPaid)} valueStyle={{ color: '#cf1322', fontSize: 14 }} /></Card></Col>
        <Col span={12}><Card size="small" className="stat-card"><Statistic title="Total Received from Customers" value={formatINR(totalReceived)} valueStyle={{ color: '#2e7d32', fontSize: 14 }} /></Card></Col>
      </Row>
      <div style={{ marginBottom: 8 }}><Text strong style={{ color: '#cf1322' }}>Supplier Payments ({payments.length})</Text></div>
      <Table dataSource={payments} columns={paymentCols} rowKey="id" size="small" pagination={false} scroll={{ x: 700 }} style={{ marginBottom: 16 }} />
      <Divider />
      <div style={{ marginBottom: 8 }}><Text strong style={{ color: '#2e7d32' }}>Customer Receipts ({receipts.length})</Text></div>
      <Table dataSource={receipts} columns={receiptCols} rowKey="id" size="small" pagination={false} scroll={{ x: 700 }} />
    </>
  )
}

// ── Journal Entries Tab ───────────────────────────────────────────────────────
function JournalTab({ data, onRefresh }: { data: any; onRefresh: () => void }) {
  const [addModal, setAddModal] = useState(false)
  const [editRow, setEditRow] = useState<any | null>(null)
  const [search, setSearch] = useState('')
  const [form] = Form.useForm()
  const [editForm] = Form.useForm()
  const createEntry = useCreateLedgerEntry()
  const updateEntry = useUpdateLedgerEntry()
  const deleteEntry = useDeleteLedgerEntry()
  const allRows = data?.manualEntries || []
  const rows = useMemo(() => {
    if (!search.trim()) return allRows
    const q = search.toLowerCase()
    return allRows.filter((r: any) =>
      (r.description ?? '').toLowerCase().includes(q) ||
      (r.reference ?? '').toLowerCase().includes(q) ||
      (r.bankAccount ?? '').toLowerCase().includes(q) ||
      (r.category ?? '').toLowerCase().includes(q) ||
      (r.notes ?? '').toLowerCase().includes(q)
    )
  }, [allRows, search])
  const nowrap = { onCell: () => ({ style: { whiteSpace: 'nowrap' as const } }) }

  function openEdit(r: any) {
    setEditRow(r)
    editForm.setFieldsValue({
      entryDate: r.entryDate ? dayjs(r.entryDate) : null,
      type: r.type,
      category: r.category,
      amount: r.amount,
      description: r.description,
      reference: r.reference,
      bankAccount: r.bankAccount,
      notes: r.notes,
    })
  }

  const cols = [
    { title: 'Date', dataIndex: 'entryDate', key: 'date', width: 90, ...nowrap, render: (v: string) => dayjs(v).format('DD/MM/YY') },
    {
      title: 'Type', dataIndex: 'type', key: 'type', width: 80,
      render: (v: string) => <Tag color={v === 'CREDIT' ? 'green' : 'red'}>{v}</Tag>,
    },
    {
      title: 'Category', dataIndex: 'category', key: 'cat', width: 120,
      render: (v: string) => <Tag color={catColor[v] ?? 'default'}>{v?.replace('_', ' ')}</Tag>,
    },
    { title: 'Description', dataIndex: 'description', key: 'desc', ellipsis: true },
    { title: 'Reference', dataIndex: 'reference', key: 'ref', width: 140, ...nowrap },
    { title: 'Bank Account', dataIndex: 'bankAccount', key: 'bank', width: 130, ...nowrap },
    {
      title: 'Amount', dataIndex: 'amount', key: 'amt', width: 130, align: 'right' as const, ...nowrap,
      render: (v: number, r: any) => <span style={{ color: r.type === 'CREDIT' ? '#2e7d32' : '#cf1322', fontWeight: 600 }}>{formatINR(v)}</span>,
    },
    {
      title: 'Source', dataIndex: 'source', key: 'src', width: 100,
      render: (v: string) => <Tag color={v === 'BANK_IMPORT' ? 'blue' : 'default'}>{v === 'BANK_IMPORT' ? 'Bank Import' : 'Manual'}</Tag>,
    },
    {
      title: '', key: 'action', width: 80,
      render: (_: any, r: any) => (
        <Space size={0}>
          <Button type="text" size="small" icon={<EditOutlined />} onClick={() => openEdit(r)} />
          <Popconfirm title="Delete this entry?" onConfirm={() => deleteEntry.mutate(r.id, { onSuccess: onRefresh })}>
            <Button type="text" danger size="small" icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ]

  const totalCredits = rows.filter((r: any) => r.type === 'CREDIT').reduce((s: number, r: any) => s + Number(r.amount), 0)
  const totalDebits = rows.filter((r: any) => r.type === 'DEBIT').reduce((s: number, r: any) => s + Number(r.amount), 0)

  async function handleAdd(values: any) {
    await createEntry.mutateAsync({
      ...values,
      entryDate: values.entryDate.format('YYYY-MM-DD'),
      source: 'MANUAL',
    }, {
      onSuccess: () => { setAddModal(false); form.resetFields(); onRefresh() },
      onError: () => message.error('Failed to save entry'),
    })
  }

  async function handleEdit(values: any) {
    if (!editRow) return
    await updateEntry.mutateAsync({
      id: editRow.id,
      ...values,
      entryDate: values.entryDate.format('YYYY-MM-DD'),
    }, {
      onSuccess: () => { setEditRow(null); editForm.resetFields(); onRefresh() },
      onError: () => message.error('Failed to update entry'),
    })
  }

  return (
    <>
      <Space style={{ marginBottom: 12 }} wrap>
        <Input
          allowClear
          prefix={<SearchOutlined />}
          placeholder="Search description, reference, category…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ width: 280 }}
        />
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setAddModal(true)}>Add Journal Entry</Button>
        <ImportBankStatement saveAs="ledger" buttonLabel="Import Bank Statement" onDone={onRefresh} />
      </Space>
      <Row gutter={[12, 0]} style={{ marginBottom: 12 }}>
        <Col span={12}><Card size="small" className="stat-card"><Statistic title="Total Credits" value={formatINR(totalCredits)} valueStyle={{ color: '#2e7d32', fontSize: 14 }} /></Card></Col>
        <Col span={12}><Card size="small" className="stat-card"><Statistic title="Total Debits" value={formatINR(totalDebits)} valueStyle={{ color: '#cf1322', fontSize: 14 }} /></Card></Col>
      </Row>
      <Table dataSource={rows} columns={cols} rowKey="id" size="small" scroll={{ x: 900 }}
        pagination={{ pageSize: 50 }}
        summary={() => (
          <Table.Summary.Row style={{ fontWeight: 700 }}>
            <Table.Summary.Cell index={0} colSpan={6}>Total</Table.Summary.Cell>
            <Table.Summary.Cell index={6} align="right">{formatINR(totalCredits - totalDebits)}</Table.Summary.Cell>
            <Table.Summary.Cell index={7} colSpan={2} />
          </Table.Summary.Row>
        )}
      />

      <Modal title="Add Journal Entry" open={addModal} onCancel={() => { setAddModal(false); form.resetFields() }}
        onOk={() => form.submit()} okText="Save Entry" confirmLoading={createEntry.isPending}>
        <Form form={form} layout="vertical" onFinish={handleAdd} style={{ marginTop: 16 }}>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="entryDate" label="Date" rules={[{ required: true }]}>
                <DatePicker format="DD/MM/YYYY" style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="type" label="Type" rules={[{ required: true }]}>
                <Select options={[{ value: 'CREDIT', label: 'CREDIT (Income)' }, { value: 'DEBIT', label: 'DEBIT (Expense)' }]} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="category" label="Category" rules={[{ required: true }]}>
                <Select options={CATEGORIES} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="amount" label="Amount (₹)" rules={[{ required: true }]}>
                <InputNumber style={{ width: '100%' }} min={0} precision={2} prefix="₹" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="description" label="Description" rules={[{ required: true }]}>
            <Input placeholder="e.g. Rent payment, Loading charges..." />
          </Form.Item>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="reference" label="Reference / UTR No.">
                <Input placeholder="Cheque/UTR number" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="bankAccount" label="Bank Account">
                <Input placeholder="e.g. SBI Current A/c" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="notes" label="Notes">
            <Input.TextArea rows={2} placeholder="Additional notes for CA..." />
          </Form.Item>
        </Form>
      </Modal>

      <Modal title="Edit Journal Entry" open={!!editRow} onCancel={() => { setEditRow(null); editForm.resetFields() }}
        onOk={() => editForm.submit()} okText="Save Changes" confirmLoading={updateEntry.isPending}>
        <Form form={editForm} layout="vertical" onFinish={handleEdit} style={{ marginTop: 16 }}>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="entryDate" label="Date" rules={[{ required: true }]}>
                <DatePicker format="DD/MM/YYYY" style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="type" label="Type" rules={[{ required: true }]}>
                <Select options={[{ value: 'CREDIT', label: 'CREDIT (Income)' }, { value: 'DEBIT', label: 'DEBIT (Expense)' }]} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="category" label="Category" rules={[{ required: true }]}>
                <Select options={CATEGORIES} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="amount" label="Amount (₹)" rules={[{ required: true }]}>
                <InputNumber style={{ width: '100%' }} min={0} precision={2} prefix="₹" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="description" label="Description" rules={[{ required: true }]}>
            <Input placeholder="e.g. Rent payment, Loading charges..." />
          </Form.Item>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="reference" label="Reference / UTR No.">
                <Input placeholder="Cheque/UTR number" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="bankAccount" label="Bank Account">
                <Input placeholder="e.g. SBI Current A/c" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="notes" label="Notes">
            <Input.TextArea rows={2} placeholder="Additional notes for CA..." />
          </Form.Item>
        </Form>
      </Modal>
    </>
  )
}

// ── Tax Summary Tab ───────────────────────────────────────────────────────────
function TaxSummaryTab({ data, dateLabel }: { data: any; dateLabel: string }) {
  const s = data?.summary
  const deliveries = data?.deliveries || []
  const invoices = data?.invoices || []

  // Group by commodity for HSN-wise summary.
  // saleValue   = net realisation from customer (gross − cess − MC).
  // netPayable  = what we paid the supplier (gross purchase − cess − MC).
  // margin      = saleValue − netPayable.
  const hsnMap: Record<string, { name: string; hsn: string; saleValue: number; purchaseValue: number; margin: number; cess: number; count: number }> = {}
  for (const d of deliveries) {
    const key = d.commodity?.id || 'unknown'
    if (!hsnMap[key]) hsnMap[key] = { name: d.commodity?.name || '-', hsn: d.commodity?.hsnCode || '-', saleValue: 0, purchaseValue: 0, margin: 0, cess: 0, count: 0 }
    const sv = Number(d.saleValue ?? 0)
    const pv = Number(d.purchaseValue ?? 0)
    const np = Number(d.netPayable ?? 0)
    hsnMap[key].saleValue += sv
    hsnMap[key].purchaseValue += pv
    hsnMap[key].margin += sv - np
    hsnMap[key].cess += Number(d.cessPaid ?? 0)
    hsnMap[key].count++
  }
  const hsnRows = Object.values(hsnMap)

  function exportExcel() {
    const wb = XLSX.utils.book_new()
    const summaryData = [
      ['TAX AUDIT SUMMARY', '', dateLabel],
      [],
      ['Metric', 'Value'],
      ['Total Sales Value', s?.totalSales ?? 0],
      ['Total Purchase Value', s?.totalPurchases ?? 0],
      ['Gross Margin', s?.grossMargin ?? 0],
      ['Gross Margin %', `${s?.grossMarginPct?.toFixed(2) ?? 0}%`],
      ['Total Cess Paid', s?.totalCess ?? 0],
      ['Total Supplier Paid', s?.totalSupplierPaid ?? 0],
      ['Supplier Outstanding', s?.supplierOutstanding ?? 0],
      ['Total Customer Received', s?.totalCustomerReceived ?? 0],
      ['Customer Outstanding', s?.customerOutstanding ?? 0],
      ['No. of Deliveries', s?.deliveryCount ?? 0],
      ['No. of Invoices', s?.invoiceCount ?? 0],
    ]
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summaryData), 'Tax Summary')

    const hsnData = [
      ['HSN-WISE SUMMARY'],
      ['Commodity', 'HSN Code', 'Transactions', 'Sale Value', 'Purchase Value', 'Margin', 'Cess Paid'],
      ...hsnRows.map(r => [r.name, r.hsn, r.count, r.saleValue, r.purchaseValue, r.margin, r.cess]),
    ]
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(hsnData), 'HSN Summary')

    XLSX.writeFile(wb, `tax-audit-report-${dayjs().format('YYYY-MM-DD')}.xlsx`)
  }

  function printPDF() {
    const hsnTableRows = hsnRows.map(r => `<tr>
      <td>${r.name}</td><td>${r.hsn}</td><td class="right">${r.count}</td>
      <td class="right">${formatINR(r.saleValue)}</td>
      <td class="right">${formatINR(r.purchaseValue)}</td>
      <td class="right ${r.margin >= 0 ? 'green' : 'red'}">${formatINR(r.margin)}</td>
      <td class="right">${formatINR(r.cess)}</td>
    </tr>`).join('')

    const body = `
      <div class="section-title">Financial Summary</div>
      <div class="summary-grid" style="grid-template-columns:repeat(4,1fr)">
        <div class="summary-card"><div class="label">Total Sales</div><div class="value green">${formatINR(s?.totalSales)}</div></div>
        <div class="summary-card"><div class="label">Total Purchases</div><div class="value red">${formatINR(s?.totalPurchases)}</div></div>
        <div class="summary-card"><div class="label">Gross Margin</div><div class="value ${(s?.grossMargin ?? 0) >= 0 ? 'green' : 'red'}">${formatINR(s?.grossMargin)} (${s?.grossMarginPct?.toFixed(1)}%)</div></div>
        <div class="summary-card"><div class="label">Total Cess</div><div class="value">${formatINR(s?.totalCess)}</div></div>
      </div>
      <div class="summary-grid" style="grid-template-columns:repeat(4,1fr)">
        <div class="summary-card"><div class="label">Supplier Paid</div><div class="value">${formatINR(s?.totalSupplierPaid)}</div></div>
        <div class="summary-card"><div class="label">Supplier Outstanding</div><div class="value red">${formatINR(s?.supplierOutstanding)}</div></div>
        <div class="summary-card"><div class="label">Customer Received</div><div class="value">${formatINR(s?.totalCustomerReceived)}</div></div>
        <div class="summary-card"><div class="label">Customer Outstanding</div><div class="value red">${formatINR(s?.customerOutstanding)}</div></div>
      </div>
      <div class="section-title">HSN-wise Commodity Summary</div>
      <table>
        <thead><tr><th>Commodity</th><th>HSN Code</th><th class="right">Txns</th><th class="right">Sale Value</th><th class="right">Purchase Value</th><th class="right">Margin</th><th class="right">Cess</th></tr></thead>
        <tbody>${hsnTableRows}</tbody>
        <tfoot><tr>
          <td colspan="2">TOTAL</td>
          <td class="right">${hsnRows.reduce((s, r) => s + r.count, 0)}</td>
          <td class="right">${formatINR(hsnRows.reduce((s, r) => s + r.saleValue, 0))}</td>
          <td class="right">${formatINR(hsnRows.reduce((s, r) => s + r.purchaseValue, 0))}</td>
          <td class="right">${formatINR(hsnRows.reduce((s, r) => s + r.margin, 0))}</td>
          <td class="right">${formatINR(hsnRows.reduce((s, r) => s + r.cess, 0))}</td>
        </tr></tfoot>
      </table>`
    openPrint('Tax Audit Summary Report', dateLabel, body)
  }

  const hsnCols = [
    { title: 'Commodity', dataIndex: 'name', key: 'name' },
    { title: 'HSN Code', dataIndex: 'hsn', key: 'hsn', width: 100 },
    { title: 'Transactions', dataIndex: 'count', key: 'count', align: 'right' as const, width: 110 },
    { title: 'Sale Value', dataIndex: 'saleValue', key: 'sv', align: 'right' as const, width: 150, render: (v: number) => formatINR(v) },
    { title: 'Purchase Value', dataIndex: 'purchaseValue', key: 'pv', align: 'right' as const, width: 150, render: (v: number) => formatINR(v) },
    { title: 'Margin', key: 'margin', align: 'right' as const, width: 150, render: (_: any, r: any) => <span style={{ color: r.margin >= 0 ? '#2e7d32' : '#cf1322', fontWeight: 600 }}>{formatINR(r.margin)}</span> },
    { title: 'Cess Paid', dataIndex: 'cess', key: 'cess', align: 'right' as const, width: 120, render: (v: number) => formatINR(v) },
  ]

  return (
    <>
      <Space style={{ marginBottom: 12 }}>
        <Button icon={<FilePdfOutlined />} type="primary" onClick={printPDF}>Print Tax Report (PDF)</Button>
        <Button icon={<FileExcelOutlined />} onClick={exportExcel}>Export for CA (Excel)</Button>
      </Space>

      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        {s && [
          { label: 'Gross Sales', value: formatINR(s.totalSales), color: '#2e7d32' },
          { label: 'Gross Purchases', value: formatINR(s.totalPurchases), color: '#cf1322' },
          { label: 'Gross Margin', value: `${formatINR(s.grossMargin)} (${s.grossMarginPct?.toFixed(1)}%)`, color: s.grossMargin >= 0 ? '#2e7d32' : '#cf1322' },
          { label: 'Cess Paid (1%)', value: formatINR(s.totalCess), color: '#8f4e00' },
          { label: 'Supplier Outstanding', value: formatINR(s.supplierOutstanding), color: '#cf1322' },
          { label: 'Customer Outstanding', value: formatINR(s.customerOutstanding), color: '#cf1322' },
          { label: 'Deliveries', value: String(s.deliveryCount), color: '#333' },
          { label: 'Invoices (Sent)', value: String(s.invoiceCount), color: '#333' },
        ].map(c => (
          <Col xs={12} sm={6} key={c.label}>
            <Card size="small">
              <div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>{c.label}</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: c.color }}>{c.value}</div>
            </Card>
          </Col>
        ))}
      </Row>

      <Divider orientation="left" style={{ fontWeight: 600 }}>HSN-wise Commodity Breakdown</Divider>
      <Table dataSource={hsnRows} columns={hsnCols} rowKey="hsn" size="small" pagination={false} />
    </>
  )
}

// Quick date presets — Indian FY runs Apr 1 → Mar 31
function getDatePresets(): { label: string; range: [Dayjs, Dayjs] }[] {
  const now = dayjs()
  const fyStartYear = now.month() >= 3 ? now.year() : now.year() - 1
  const fyStart = dayjs(`${fyStartYear}-04-01`)
  const fyEnd = dayjs(`${fyStartYear + 1}-03-31`)
  const lastFyStart = dayjs(`${fyStartYear - 1}-04-01`)
  const lastFyEnd = dayjs(`${fyStartYear}-03-31`)
  return [
    { label: 'This Month', range: [now.startOf('month'), now.endOf('month')] },
    { label: 'Last Month', range: [now.subtract(1, 'month').startOf('month'), now.subtract(1, 'month').endOf('month')] },
    { label: 'This Quarter', range: [now.startOf('quarter'), now.endOf('quarter')] },
    { label: `FY ${fyStartYear}-${String(fyStartYear + 1).slice(2)}`, range: [fyStart, fyEnd] },
    { label: `FY ${fyStartYear - 1}-${String(fyStartYear).slice(2)}`, range: [lastFyStart, lastFyEnd] },
  ]
}

// ── Main LedgerPage ───────────────────────────────────────────────────────────
export default function LedgerPage() {
  const [range, setRange] = useState<[Dayjs | null, Dayjs | null]>([null, null])
  const [from, to] = [
    range[0]?.format('YYYY-MM-DD') ?? null,
    range[1]?.format('YYYY-MM-DD') ?? null,
  ]
  const params: any = {}
  if (from) params.from = from
  if (to) params.to = to

  const { data, refetch } = useLedgerSummary(params)
  const dateLabel = from && to
    ? `${dayjs(from).format('DD MMM YYYY')} to ${dayjs(to).format('DD MMM YYYY')}`
    : 'All dates'

  const presets = useMemo(() => getDatePresets(), [])
  const deliveries = data?.deliveries ?? []
  const salesCount = deliveries.filter((d: any) => Number(d.saleValue ?? 0) > 0).length
  const purchaseCount = deliveries.filter((d: any) => Number(d.purchaseValue ?? 0) > 0).length

  const tabItems = [
    {
      key: 'tax',
      label: <span><BookOutlined /> Tax Summary</span>,
      children: <TaxSummaryTab data={data} dateLabel={dateLabel} />,
    },
    {
      key: 'sales',
      label: `Sales (${salesCount})`,
      children: <SalesTab data={data} />,
    },
    {
      key: 'purchases',
      label: `Purchases (${purchaseCount})`,
      children: <PurchasesTab data={data} />,
    },
    {
      key: 'payments',
      label: `Payments (${(data?.supplierPayments?.length ?? 0) + (data?.customerReceipts?.length ?? 0)})`,
      children: <PaymentsTab data={data} />,
    },
    {
      key: 'journal',
      label: `Journal Entries (${data?.manualEntries?.length ?? 0})`,
      children: <JournalTab data={data} onRefresh={() => refetch()} />,
    },
  ]

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <Title level={4} style={{ margin: 0 }}>Ledger</Title>
          <Text type="secondary" style={{ fontSize: 12 }}>Complete financial ledger for tax audit — share with your Chartered Accountant</Text>
        </div>
        <Space wrap size={6}>
          {presets.map(p => {
            const active = range[0]?.isSame(p.range[0], 'day') && range[1]?.isSame(p.range[1], 'day')
            return (
              <Button
                key={p.label}
                size="small"
                type={active ? 'primary' : 'default'}
                onClick={() => setRange(p.range)}
              >
                {p.label}
              </Button>
            )
          })}
          <RangePicker
            format="DD/MM/YYYY"
            style={{ width: 260 }}
            value={range[0] && range[1] ? [range[0], range[1]] : undefined}
            onChange={(dates) => setRange([dates?.[0] ?? null, dates?.[1] ?? null])}
            allowClear
            placeholder={['From date', 'To date']}
          />
        </Space>
      </div>

      <SummaryCards data={data} />

      <Tabs items={tabItems} defaultActiveKey="tax" destroyInactiveTabPane={false} />
    </div>
  )
}
