import { useState, useCallback, useMemo, useEffect } from 'react'
import {
  Table, Button, Modal, Form, Input, InputNumber, Select, DatePicker,
  Typography, Space, Popconfirm, message, Divider, Row, Col,
  Descriptions, Switch, Tooltip, Tag, Alert, Tabs, Badge
} from 'antd'
import { PlusOutlined, EditOutlined, EyeOutlined, DeleteOutlined, UploadOutlined, SaveOutlined, FilterOutlined, CheckSquareOutlined } from '@ant-design/icons'
import ImportWeighingReport from './ImportWeighingReport'
import {
  useDeliveries, useCreateDelivery, useUpdateDelivery, useDeleteDelivery,
  useSuppliers, useCustomers, useCommodities, useDailyRates, useDelivery, useInvoices
} from '../../api/hooks'
import { formatINR } from '../../utils/format'
import { MC_THRESHOLD_PCT, CESS_RATE, QT_TO_KG, KG_TO_QT } from '../../utils/constants'
import dayjs from 'dayjs'

const qtToKg = (qt: number | null | undefined) => qt != null ? +(Number(qt) * QT_TO_KG).toFixed(1) : null
const kgToQt = (kg: number | null | undefined) => kg != null ? +(Number(kg) * KG_TO_QT).toFixed(3) : null

function calcDerived(r: any) {
  const gross = Number(r.grossWeight ?? 0)
  const tare = Number(r.tareWeight ?? 0)
  const qd = Number(r.qualityDeductionPct ?? 0)
  const netWeight = gross - tare
  const adjustedWeight = netWeight * (1 - qd / 100)
  const purchaseValue = r.purchaseRate ? adjustedWeight * Number(r.purchaseRate) : null
  const saleValue = r.saleRate ? adjustedWeight * Number(r.saleRate) : null
  const grossMargin = saleValue != null && purchaseValue != null ? saleValue - purchaseValue : null
  const mc = Number(r.moisturePct ?? 0)
  const mcDeduction = saleValue != null && mc > MC_THRESHOLD_PCT ? ((mc - MC_THRESHOLD_PCT) / 100) * saleValue : 0
  const cessPaid = Number(r.cessPaid ?? 0)
  // Use cessRate (daily sale rate for that date) for cess; fall back to saleRate
  const cessRateVal = r.cessRate ? Number(r.cessRate) : (r.saleRate ? Number(r.saleRate) : null)
  const cessBaseValue = cessRateVal ? adjustedWeight * cessRateVal : null
  const balanceCess = cessBaseValue != null
    ? (r.cessApplicable ? cessBaseValue * CESS_RATE - cessPaid : -cessPaid)
    : null
  const netPayable = purchaseValue != null && balanceCess != null
    ? purchaseValue - balanceCess - mcDeduction
    : null
  return { netWeight, adjustedWeight, purchaseValue, saleValue, grossMargin, mcDeduction, balanceCess, netPayable }
}

function DeliveryDetail({ id }: { id: string }) {
  const { data: d } = useDelivery(id)
  const { data: dailyRates } = useDailyRates(
    d?.deliveryDate ?? null,
    d?.commodityId ?? null,
  )
  if (!d) return null
  // Always use the daily sale rate from the Sale Rates page; fall back to stored saleRate only if no daily rate exists
  const liveSaleRate = dailyRates?.saleRate ?? (d.saleRate ? Number(d.saleRate) : null)
  const calc = calcDerived({ ...d, saleRate: liveSaleRate, cessRate: liveSaleRate })
  return (
    <Descriptions bordered size="small" column={2}>
      <Descriptions.Item label="Slip No.">{d.lrNumber || '-'}</Descriptions.Item>
      <Descriptions.Item label="System LR No.">{d.deliveryNumber}</Descriptions.Item>
      <Descriptions.Item label="Date">{dayjs(d.deliveryDate).format('DD/MM/YYYY')}</Descriptions.Item>
      <Descriptions.Item label="Vehicle">{d.vehicleNumber}</Descriptions.Item>
      <Descriptions.Item label="Supplier">{d.supplier?.name || '-'}</Descriptions.Item>
      <Descriptions.Item label="Commodity">{d.commodity?.name || '-'}</Descriptions.Item>
      <Descriptions.Item label="Gross Weight">{qtToKg(d.grossWeight)?.toLocaleString('en-IN')} Kg</Descriptions.Item>
      <Descriptions.Item label="Tare Weight">{qtToKg(d.tareWeight)?.toLocaleString('en-IN')} Kg</Descriptions.Item>
      <Descriptions.Item label="Net Weight (A)"><b>{qtToKg(calc.netWeight)?.toLocaleString('en-IN')} Kg</b></Descriptions.Item>
      <Descriptions.Item label="Quality Deduction">{d.qualityDeductionPct ?? 0}%</Descriptions.Item>
      <Descriptions.Item label="Purchase Rate (B)">₹{Number(d.purchaseRate || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}/Qt</Descriptions.Item>
      <Descriptions.Item label="Gross Amt (D = A×B)"><b>{formatINR(calc.purchaseValue)}</b></Descriptions.Item>
      <Descriptions.Item label="MC Content %">{d.moisturePct ? `${d.moisturePct}%` : '-'}</Descriptions.Item>
      <Descriptions.Item label="MC Deduction (F)">
        <span style={{ color: calc.mcDeduction > 0 ? '#cf1322' : undefined }}>
          {calc.mcDeduction > 0 ? formatINR(calc.mcDeduction) : `₹0 (MC ≤ ${MC_THRESHOLD_PCT}%)`}
        </span>
      </Descriptions.Item>
      <Descriptions.Item label="Cess Applicable">{d.cessApplicable ? 'Yes' : 'No'}</Descriptions.Item>
      <Descriptions.Item label="Cess Paid (C)">{formatINR(d.cessPaid ?? 0)}</Descriptions.Item>
      <Descriptions.Item label="Balance Cess (E)" span={2}>
        <span style={{ color: calc.balanceCess != null && calc.balanceCess > 0 ? '#cf1322' : '#389e0d' }}>
          {calc.balanceCess != null ? formatINR(calc.balanceCess) : '-'}
          <span style={{ color: '#888', fontSize: 11, marginLeft: 8 }}>
            {d.cessApplicable ? `(${CESS_RATE * 100}% of Sale − Cess Paid)` : '(−Cess Paid)'}
          </span>
        </span>
      </Descriptions.Item>
      <Descriptions.Item label="Net Payable (G = D−E−F)" span={2}>
        <b style={{ color: '#1677ff', fontSize: 14 }}>{calc.netPayable != null ? formatINR(calc.netPayable) : '-'}</b>
      </Descriptions.Item>
      <Descriptions.Item label="Sale Rate">
        {liveSaleRate != null ? `₹${Number(liveSaleRate).toLocaleString('en-IN', { maximumFractionDigits: 2 })}/Qt` : '-'}
        {dailyRates?.saleRate == null && d.saleRate && <span style={{ color: '#faad14', fontSize: 11, marginLeft: 6 }}>(no daily rate set)</span>}
      </Descriptions.Item>
      <Descriptions.Item label="Sale Value">{calc.saleValue != null ? formatINR(calc.saleValue) : '-'}</Descriptions.Item>
      <Descriptions.Item label="Margin" span={2}>
        <b style={{ color: calc.grossMargin != null && calc.grossMargin >= 0 ? '#389e0d' : '#cf1322' }}>{calc.grossMargin != null ? formatINR(calc.grossMargin) : '-'}</b>
      </Descriptions.Item>
      {d.notes && <Descriptions.Item label="Notes" span={2}>{d.notes}</Descriptions.Item>}
    </Descriptions>
  )
}

function InlineText({ value, onSave, placeholder, bold }: {
  value: string | null | undefined; onSave: (v: string | null) => void
  placeholder?: string; bold?: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  function start() { setDraft(value ?? ''); setEditing(true) }
  function commit() { setEditing(false); const v = draft.trim() || null; if (v !== (value ?? null)) onSave(v) }
  if (editing) {
    return <Input autoFocus size="small" value={draft} placeholder={placeholder}
      onChange={e => setDraft(e.target.value)} onBlur={commit} onPressEnter={commit} style={{ width: 90 }} />
  }
  return (
    <Tooltip title="Click to edit">
      <span onClick={start} style={{ cursor: 'pointer', borderBottom: '1px dashed #aaa', fontWeight: bold ? 600 : undefined, whiteSpace: 'nowrap', color: value ? undefined : '#bbb' }}>
        {value || <span style={{ color: '#bbb' }}>{placeholder ?? '-'}</span>}
      </span>
    </Tooltip>
  )
}

function InlineNum({ value, onSave, min = 0, step = 1, prefix, suffix, style, decimals = 0 }: {
  value: number | null | undefined; onSave: (v: number | null) => void
  min?: number; step?: number; prefix?: string; suffix?: string; style?: React.CSSProperties; decimals?: number
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<number | null>(null)
  function start() { setDraft(value ?? null); setEditing(true) }
  function commit() { setEditing(false); if (draft !== value) onSave(draft) }
  if (editing) {
    return <InputNumber autoFocus size="small" min={min} step={step} value={draft}
      onChange={v => setDraft(v)} onBlur={commit} onPressEnter={commit} style={{ width: 90, ...style }} />
  }
  const display = value != null ? `${prefix ?? ''}${Number(value).toLocaleString('en-IN', { maximumFractionDigits: decimals })}${suffix ?? ''}` : null
  return (
    <Tooltip title="Click to edit">
      <span onClick={start} style={{ cursor: 'pointer', borderBottom: '1px dashed #aaa', whiteSpace: 'nowrap', ...style }}>
        {display ?? <span style={{ color: '#bbb' }}>-</span>}
      </span>
    </Tooltip>
  )
}

function DeliverySheet({ commodityId, commodityName }: { commodityId: string | null; commodityName: string }) {
  const [open, setOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [importFormat, setImportFormat] = useState<'new' | 'old'>('new')
  const [viewId, setViewId] = useState<string | null>(null)
  const [editing, setEditing] = useState<any>(null)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [overrides, setOverrides] = useState<Record<string, Partial<any>>>({})
  const [form] = Form.useForm()
  const [bulkForm] = Form.useForm()

  // Filters
  const [filterSupplier, setFilterSupplier] = useState<string | null>(null)
  const [filterDateRange, setFilterDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs] | null>(null)
  const [filterSearch, setFilterSearch] = useState('')

  const [rateDate, setRateDate] = useState<string | null>(null)
  const [rateCommodityId, setRateCommodityId] = useState<string | null>(null)

  const { data: deliveries = [], isLoading } = useDeliveries()
  const { data: invoices = [] } = useInvoices()
  const invoicedDeliveryIds = useMemo(() => {
    const ids = new Set<string>()
    for (const inv of invoices as any[]) {
      for (const item of inv.items ?? []) if (item.deliveryId) ids.add(item.deliveryId)
    }
    return ids
  }, [invoices])
  const { data: suppliers = [] } = useSuppliers()
  const { data: customers = [] } = useCustomers()
  const { data: commodities = [] } = useCommodities()
  const { data: dailyRates } = useDailyRates(rateDate, rateCommodityId)
  const { mutateAsync: create } = useCreateDelivery()
  const { mutateAsync: update } = useUpdateDelivery()
  const { mutateAsync: remove } = useDeleteDelivery()

  // Filter to this commodity tab (null = All tab shows untagged + all)
  const tabDeliveries = useMemo(() => {
    if (commodityId === null) return deliveries
    if (commodityId === '__untagged__') return deliveries.filter((d: any) => !d.commodityId)
    return deliveries.filter((d: any) => d.commodityId === commodityId)
  }, [deliveries, commodityId])

  const row = useCallback((r: any) => ({ ...r, ...(overrides[r.id] ?? {}) }), [overrides])

  // Pre-compute derived values for every row once per render - avoids 8× calcDerived per row per render
  const derivedMap = useMemo(() => {
    const map = new Map<string, ReturnType<typeof calcDerived>>()
    for (const r of tabDeliveries) {
      map.set(r.id, calcDerived(row(r)))
    }
    return map
  }, [tabDeliveries, overrides])

  const filteredDeliveries = useMemo(() => {
    let rows = [...tabDeliveries]
    if (filterSupplier) rows = rows.filter((r: any) => r.supplierId === filterSupplier)
    if (filterDateRange) {
      const [from, to] = filterDateRange
      rows = rows.filter((r: any) => {
        const d = dayjs(r.deliveryDate)
        return d.isAfter(from.subtract(1, 'day')) && d.isBefore(to.add(1, 'day'))
      })
    }
    if (filterSearch) {
      const q = filterSearch.toLowerCase()
      rows = rows.filter((r: any) =>
        r.lrNumber?.toLowerCase().includes(q) ||
        r.vehicleNumber?.toLowerCase().includes(q) ||
        r.supplier?.name?.toLowerCase().includes(q)
      )
    }
    return rows.sort((a: any, b: any) => {
      const an = parseInt(a.lrNumber ?? '0', 10) || 0
      const bn = parseInt(b.lrNumber ?? '0', 10) || 0
      if (an !== bn) return an - bn
      return (a.deliveryNumber ?? '').localeCompare(b.deliveryNumber ?? '')
    })
  }, [deliveries, filterSupplier, filterDateRange, filterSearch])

  // Auto-fill rates when daily rates are fetched for the current form date+commodity
  useEffect(() => {
    if (!open || !dailyRates) return
    if (dailyRates.purchaseRate != null) form.setFieldValue('purchaseRate', dailyRates.purchaseRate)
    if (dailyRates.saleRate != null) form.setFieldValue('saleRate', dailyRates.saleRate)
  }, [dailyRates, open, rateDate, rateCommodityId])

  function onFormDateOrCommodityChange() {
    const vals = form.getFieldsValue(['deliveryDate', 'commodityId'])
    setRateDate(vals.deliveryDate ? vals.deliveryDate.format('YYYY-MM-DD') : null)
    setRateCommodityId(vals.commodityId ?? null)
  }

  function openAdd() {
    setEditing(null)
    form.resetFields()
    if (commodityId && commodityId !== '__untagged__') {
      form.setFieldValue('commodityId', commodityId)
      setRateCommodityId(commodityId)
    } else {
      setRateDate(null); setRateCommodityId(null)
    }
    setOpen(true)
  }
  function openEdit(r: any) {
    const merged = row(r)
    setEditing(merged)
    form.setFieldsValue({ ...merged, deliveryDate: dayjs(merged.deliveryDate), grossWeight: qtToKg(merged.grossWeight), tareWeight: qtToKg(merged.tareWeight), cessApplicable: !!merged.cessApplicable })
    setRateDate(merged.deliveryDate ? dayjs(merged.deliveryDate).format('YYYY-MM-DD') : null)
    setRateCommodityId(merged.commodityId ?? null)
    setOpen(true)
  }

  async function onSave() {
    const values = await form.validateFields()
    const payload = { ...values, deliveryDate: values.deliveryDate.format('YYYY-MM-DD'), grossWeight: kgToQt(values.grossWeight), tareWeight: kgToQt(values.tareWeight) }
    try {
      if (editing) {
        await update({ id: editing.id, ...payload })
        setOverrides(prev => { const n = { ...prev }; delete n[editing.id]; return n })
        message.success('Delivery updated')
      } else {
        await create(payload)
        message.success('Delivery recorded')
      }
      setOpen(false)
    } catch { message.error('Error saving delivery') }
  }

  const patch = useCallback((id: string, fields: Record<string, any>) => {
    setOverrides(prev => ({ ...prev, [id]: { ...(prev[id] ?? {}), ...fields } }))
    update({ id, ...fields }).catch(() => {
      message.error('Failed to save')
      setOverrides(prev => {
        const n = { ...prev }
        const reverted = { ...(n[id] ?? {}) }
        Object.keys(fields).forEach(k => delete reverted[k])
        if (Object.keys(reverted).length === 0) delete n[id]; else n[id] = reverted
        return n
      })
    })
  }, [update])

  async function applyToSelected() {
    const vals = bulkForm.getFieldsValue()
    const fields: Record<string, any> = {}
    if (vals.supplierId != null) fields.supplierId = vals.supplierId
    if (vals.commodityId != null) fields.commodityId = vals.commodityId
    if (vals.customerId != null) fields.customerId = vals.customerId
    if (vals.purchaseRate != null) fields.purchaseRate = vals.purchaseRate
    if (vals.saleRate != null) fields.saleRate = vals.saleRate
    if (vals.moisturePct != null) fields.moisturePct = vals.moisturePct
    if (vals.cessApplicable != null) fields.cessApplicable = vals.cessApplicable
    if (vals.cessPaid != null) fields.cessPaid = vals.cessPaid
    if (Object.keys(fields).length === 0) { message.warning('No values to apply'); return }
    let ok = 0
    for (const id of selectedIds) {
      patch(id, fields)
      ok++
    }
    message.success(`Applied to ${ok} rows`)
    bulkForm.resetFields()
  }

  async function deleteSelected() {
    let failed = 0
    for (const id of selectedIds) {
      try { await remove(id) } catch { failed++ }
    }
    if (failed === 0) message.success(`${selectedIds.length} deliveries deleted`)
    else message.warning(`${selectedIds.length - failed} deleted, ${failed} failed`)
    setSelectedIds([])
  }

  const columns = [
    {
      title: 'Slip No.', key: 'slip', width: 120, fixed: 'left' as const,
      render: (_: any, raw: any) => {
        const r = row(raw)
        const incomplete = !r.supplierId || !r.commodityId || !r.purchaseRate
        return (
          <Space size={4}>
            <InlineText value={r.lrNumber} onSave={v => patch(r.id, { lrNumber: v })} placeholder="-" bold />
            {incomplete && <Tag color="warning" style={{ fontSize: 10, padding: '0 3px', lineHeight: '16px' }}>!</Tag>}
          </Space>
        )
      }
    },
    { title: 'Date', dataIndex: 'deliveryDate', key: 'date', width: 100, sorter: (a: any, b: any) => a.deliveryDate.localeCompare(b.deliveryDate), render: (v: string) => <span className="nowrap">{dayjs(v).format('DD/MM/YYYY')}</span> },
    { title: 'Vehicle', dataIndex: 'vehicleNumber', key: 'vehicle', width: 110, sorter: (a: any, b: any) => (a.vehicleNumber ?? '').localeCompare(b.vehicleNumber ?? '') },
    { title: 'Supplier', key: 'supplier', width: 110, ellipsis: true, sorter: (a: any, b: any) => (a.supplier?.name ?? '').localeCompare(b.supplier?.name ?? ''), render: (_: any, raw: any) => row(raw).supplier?.name ?? <span style={{ color: '#bbb' }}>-</span> },
    { title: 'Commodity', key: 'commodity', width: 110, ellipsis: true, sorter: (a: any, b: any) => (a.commodity?.name ?? '').localeCompare(b.commodity?.name ?? ''), render: (_: any, raw: any) => row(raw).commodity?.name ?? <span style={{ color: '#bbb' }}>-</span> },
    {
      title: 'Net Wt (Kg)', key: 'netWt', width: 100,
      sorter: (a: any, b: any) => (derivedMap.get(a.id)?.netWeight ?? 0) - (derivedMap.get(b.id)?.netWeight ?? 0),
      render: (_: any, raw: any) => <b>{qtToKg(derivedMap.get(raw.id)?.netWeight)?.toLocaleString('en-IN') ?? '-'}</b>
    },
    {
      title: 'Rate (₹/Qt)', key: 'rate', width: 105,
      sorter: (a: any, b: any) => (Number(row(a).purchaseRate) || 0) - (Number(row(b).purchaseRate) || 0),
      render: (_: any, raw: any) => {
        const r = row(raw)
        return <InlineNum value={r.purchaseRate} step={0.5} decimals={2} onSave={v => patch(r.id, { purchaseRate: v })} prefix="₹" />
      }
    },
    {
      title: 'Purchase Value', key: 'pv', width: 120,
      sorter: (a: any, b: any) => (derivedMap.get(a.id)?.purchaseValue ?? 0) - (derivedMap.get(b.id)?.purchaseValue ?? 0),
      render: (_: any, raw: any) => formatINR(derivedMap.get(raw.id)?.purchaseValue)
    },
    {
      title: 'MC %', key: 'mc', width: 75,
      render: (_: any, raw: any) => {
        const r = row(raw)
        return <InlineNum value={r.moisturePct} step={0.1} decimals={1} onSave={v => patch(r.id, { moisturePct: v })} suffix="%" />
      }
    },
    {
      title: 'MC Ded.', key: 'mcDed', width: 95,
      render: (_: any, raw: any) => {
        const { mcDeduction } = derivedMap.get(raw.id) ?? { mcDeduction: 0 }
        return mcDeduction > 0 ? <span style={{ color: '#cf1322' }}>{formatINR(mcDeduction)}</span> : <span style={{ color: '#ccc' }}>-</span>
      }
    },
    {
      title: 'Cess', key: 'cess', width: 62,
      render: (_: any, raw: any) => {
        const r = row(raw)
        return <Switch size="small" checked={!!r.cessApplicable} checkedChildren="Y" unCheckedChildren="N" onChange={v => patch(r.id, { cessApplicable: v })} />
      }
    },
    {
      title: 'Cess Paid', key: 'cessPaid', width: 95,
      render: (_: any, raw: any) => {
        const r = row(raw)
        return <InlineNum value={r.cessPaid} onSave={v => patch(r.id, { cessPaid: v })} prefix="₹" />
      }
    },
    {
      title: 'Bal. Cess', key: 'balCess', width: 105,
      render: (_: any, raw: any) => {
        const { balanceCess } = derivedMap.get(raw.id) ?? {}
        if (balanceCess == null) return <span style={{ color: '#ccc' }}>-</span>
        return <span style={{ color: balanceCess > 0 ? '#cf1322' : '#389e0d' }}>{formatINR(balanceCess)}</span>
      }
    },
    {
      title: 'Net Payable', key: 'netPay', width: 115,
      sorter: (a: any, b: any) => (derivedMap.get(a.id)?.netPayable ?? 0) - (derivedMap.get(b.id)?.netPayable ?? 0),
      render: (_: any, raw: any) => {
        const { netPayable } = derivedMap.get(raw.id) ?? {}
        return netPayable != null ? <b style={{ color: '#1677ff' }}>{formatINR(netPayable)}</b> : <span style={{ color: '#ccc' }}>-</span>
      }
    },
    {
      title: 'Sale Value', key: 'sv', width: 110,
      sorter: (a: any, b: any) => (derivedMap.get(a.id)?.saleValue ?? 0) - (derivedMap.get(b.id)?.saleValue ?? 0),
      render: (_: any, raw: any) => {
        const { saleValue } = derivedMap.get(raw.id) ?? {}
        return saleValue != null ? formatINR(saleValue) : '-'
      }
    },
    {
      title: 'Margin', key: 'margin', width: 105,
      sorter: (a: any, b: any) => (derivedMap.get(a.id)?.grossMargin ?? 0) - (derivedMap.get(b.id)?.grossMargin ?? 0),
      render: (_: any, raw: any) => {
        const { grossMargin } = derivedMap.get(raw.id) ?? {}
        if (grossMargin == null) return <span style={{ color: '#ccc' }}>-</span>
        return <b style={{ color: grossMargin >= 0 ? '#389e0d' : '#cf1322' }}>{formatINR(grossMargin)}</b>
      }
    },
    {
      title: 'Invoiced', key: 'invoiced', width: 85,
      render: (_: any, raw: any) => invoicedDeliveryIds.has(raw.id)
        ? <Tag color="blue">Invoiced</Tag>
        : <span style={{ color: '#ccc', fontSize: 11 }}>-</span>,
    },
    {
      title: 'Actions', key: 'actions', width: 110, fixed: 'right' as const,
      render: (_: any, r: any) => (
        <Space size={4}>
          <Button size="small" icon={<EyeOutlined />} onClick={() => setViewId(r.id)} />
          <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(r)} />
          <Popconfirm title="Delete this delivery?" onConfirm={() => remove(r.id).then(() => message.success('Deleted')).catch((e: any) => message.error(e?.response?.data?.error || 'Cannot delete'))}>
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ]

  const hasSelection = selectedIds.length > 0
  const untaggedCount = tabDeliveries.filter((d: any) => !d.supplierId || !d.commodityId || !d.purchaseRate).length

  function selectAllUntagged() {
    const ids = filteredDeliveries.filter((d: any) => !d.supplierId || !d.commodityId || !d.purchaseRate).map((d: any) => d.id)
    setSelectedIds(ids)
  }

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <Space>
          {hasSelection && (
            <Popconfirm title={`Delete ${selectedIds.length} selected deliveries?`} onConfirm={deleteSelected} okText="Delete" okButtonProps={{ danger: true }}>
              <Button danger icon={<DeleteOutlined />}>Delete {selectedIds.length}</Button>
            </Popconfirm>
          )}
          <Button icon={<UploadOutlined />} onClick={() => { setImportFormat('new'); setImportOpen(true) }}>Import Weighing Report</Button>
          <Button icon={<UploadOutlined />} onClick={() => { setImportFormat('old'); setImportOpen(true) }}>Import (Old Format)</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={openAdd}>Record Delivery</Button>
        </Space>
      </div>

      {/* Filter bar */}
      <div style={{ background: '#fafafa', border: '1px solid #f0f0f0', borderRadius: 6, padding: '8px 12px', marginBottom: 10 }}>
        <Space wrap size={8}>
          <FilterOutlined style={{ color: '#888' }} />
          <Input.Search
            placeholder="Search slip, vehicle, supplier…"
            allowClear size="small" style={{ width: 220 }}
            onSearch={v => setFilterSearch(v)}
            onChange={e => !e.target.value && setFilterSearch('')}
          />
          <Select
            placeholder="Supplier" allowClear showSearch optionFilterProp="label" size="small" style={{ width: 180 }}
            options={suppliers.map((s: any) => ({ value: s.id, label: s.name }))}
            onChange={v => setFilterSupplier(v ?? null)}
          />
          <DatePicker.RangePicker
            size="small" format="DD/MM/YYYY" style={{ width: 220 }}
            onChange={v => setFilterDateRange(v as any)}
          />
          {(filterSupplier || filterDateRange || filterSearch) && (
            <Button size="small" onClick={() => { setFilterSupplier(null); setFilterDateRange(null); setFilterSearch('') }}>
              Clear
            </Button>
          )}
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {filteredDeliveries.length} of {tabDeliveries.length} rows
          </Typography.Text>
        </Space>
      </div>

      {/* Untagged data warning */}
      {untaggedCount > 0 && !hasSelection && (
        <Alert
          type="warning"
          style={{ marginBottom: 10 }}
          message={
            <span>
              <b>{untaggedCount}</b> {untaggedCount === 1 ? 'delivery is' : 'deliveries are'} missing supplier, commodity, or purchase rate - reports will show incomplete data.{' '}
              <a onClick={selectAllUntagged}>Select all untagged rows</a> to fill them in bulk.
            </span>
          }
          showIcon
        />
      )}

      {/* Apply to Selected bar */}
      {hasSelection && (
        <div style={{ background: '#fffbe6', border: '1px solid #ffe58f', borderRadius: 6, padding: '8px 12px', marginBottom: 10 }}>
          <div style={{ marginBottom: 6 }}>
            <CheckSquareOutlined style={{ color: '#d48806', marginRight: 6 }} />
            <Typography.Text strong style={{ fontSize: 13 }}>Apply to {selectedIds.length} selected rows:</Typography.Text>
            <a style={{ marginLeft: 10, fontSize: 12 }} onClick={() => setSelectedIds([])}>clear selection</a>
          </div>
          <Form form={bulkForm} layout="inline" size="small">
            <Form.Item label="Supplier" name="supplierId" style={{ marginBottom: 4 }}>
              <Select placeholder="Supplier" style={{ width: 160 }} showSearch optionFilterProp="label" allowClear
                options={suppliers.map((s: any) => ({ value: s.id, label: s.name }))} />
            </Form.Item>
            <Form.Item label="Commodity" name="commodityId" style={{ marginBottom: 4 }}>
              <Select placeholder="Commodity" style={{ width: 150 }} showSearch optionFilterProp="label" allowClear
                options={commodities.map((c: any) => ({ value: c.id, label: c.name }))} />
            </Form.Item>
            <Form.Item label="Customer" name="customerId" style={{ marginBottom: 4 }}>
              <Select placeholder="Customer" style={{ width: 150 }} showSearch optionFilterProp="label" allowClear
                options={customers.map((c: any) => ({ value: c.id, label: c.name }))} />
            </Form.Item>
            <Form.Item label="Rate (₹/Qt)" name="purchaseRate" style={{ marginBottom: 4 }}>
              <InputNumber placeholder="Rate" min={0} step={0.5} style={{ width: 95 }} />
            </Form.Item>
            <Form.Item label="Sale Rate" name="saleRate" style={{ marginBottom: 4 }}>
              <InputNumber placeholder="Rate" min={0} step={0.5} style={{ width: 95 }} />
            </Form.Item>
            <Form.Item label="MC %" name="moisturePct" style={{ marginBottom: 4 }}>
              <InputNumber placeholder="14.5" min={0} max={100} step={0.1} style={{ width: 80 }} />
            </Form.Item>
            <Form.Item label="Cess" name="cessApplicable" valuePropName="checked" style={{ marginBottom: 4 }}>
              <Switch size="small" checkedChildren="Y" unCheckedChildren="N" />
            </Form.Item>
            <Form.Item label="Cess Paid" name="cessPaid" style={{ marginBottom: 4 }}>
              <InputNumber placeholder="0" min={0} style={{ width: 85 }} />
            </Form.Item>
            <Form.Item style={{ marginBottom: 4 }}>
              <Button type="primary" size="small" onClick={applyToSelected}>Apply to Selected</Button>
            </Form.Item>
          </Form>
        </div>
      )}

      <Table
        dataSource={filteredDeliveries}
        columns={columns}
        rowKey="id"
        loading={isLoading}
        size="small"
        scroll={{ x: 1500 }}
        rowSelection={{ selectedRowKeys: selectedIds, onChange: keys => setSelectedIds(keys as string[]) }}
        pagination={{ pageSize: 50, showSizeChanger: true, showTotal: (t) => `${t} deliveries` }}
      />

      {/* View Modal */}
      <Modal title="Delivery Details" open={!!viewId} onCancel={() => setViewId(null)} footer={null} width={720}>
        {viewId && <DeliveryDetail id={viewId} />}
      </Modal>

      {/* Import Modal */}
      <ImportWeighingReport open={importOpen} onClose={() => setImportOpen(false)} onDone={() => setImportOpen(false)} formatHint={importFormat} />

      {/* Add/Edit Modal */}
      <Modal title={editing ? 'Edit Delivery' : 'Record Delivery'} open={open} onOk={onSave} onCancel={() => setOpen(false)}
        width={720} okText={editing ? 'Save Changes' : 'Record'} okButtonProps={{ icon: <SaveOutlined /> }}>
        <Form form={form} layout="vertical" size="small">
          <Row gutter={12}>
            <Col span={8}>
              <Form.Item label="Delivery Date" name="deliveryDate" rules={[{ required: true }]}>
                <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" onChange={onFormDateOrCommodityChange} />
              </Form.Item>
            </Col>
            <Col span={8}><Form.Item label="Vehicle Number" name="vehicleNumber" rules={[{ required: true }]}><Input placeholder="e.g. AP07TF6826" /></Form.Item></Col>
            <Col span={8}><Form.Item label="Slip No." name="lrNumber"><Input placeholder="Challan / Slip number" /></Form.Item></Col>
          </Row>
          <Row gutter={12}>
            <Col span={12}><Form.Item label="Supplier" name="supplierId"><Select showSearch optionFilterProp="label" allowClear options={suppliers.map((s: any) => ({ value: s.id, label: s.name }))} /></Form.Item></Col>
            <Col span={12}>
              <Form.Item label="Commodity" name="commodityId">
                <Select showSearch optionFilterProp="label" allowClear
                  options={commodities.map((c: any) => ({ value: c.id, label: c.name }))}
                  onChange={onFormDateOrCommodityChange} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col span={12}><Form.Item label="Customer (Buyer)" name="customerId"><Select showSearch optionFilterProp="label" allowClear options={customers.map((c: any) => ({ value: c.id, label: c.name }))} /></Form.Item></Col>
          </Row>
          <Divider orientation="left" orientationMargin={0} style={{ margin: '6px 0' }}>Weight (Kg)</Divider>
          <Row gutter={12}>
            <Col span={8}><Form.Item label="Gross Weight (Kg)" name="grossWeight" rules={[{ required: true }]}><InputNumber min={0} style={{ width: '100%' }} step={10} /></Form.Item></Col>
            <Col span={8}><Form.Item label="Tare Weight (Kg)" name="tareWeight" rules={[{ required: true }]}><InputNumber min={0} style={{ width: '100%' }} step={10} /></Form.Item></Col>
            <Col span={8}><Form.Item label="Quality Deduction (%)" name="qualityDeductionPct" initialValue={0}><InputNumber min={0} max={100} style={{ width: '100%' }} step={0.01} /></Form.Item></Col>
          </Row>
          <Divider orientation="left" orientationMargin={0} style={{ margin: '6px 0' }}>Rates</Divider>
          <Row gutter={12}>
            <Col span={12}><Form.Item label="Purchase Rate (₹/Qt)" name="purchaseRate"><InputNumber min={0} style={{ width: '100%' }} step={0.5} /></Form.Item></Col>
            <Col span={12}><Form.Item label="Sale Rate (₹/Qt)" name="saleRate"><InputNumber min={0} style={{ width: '100%' }} step={0.5} /></Form.Item></Col>
          </Row>
          <Divider orientation="left" orientationMargin={0} style={{ margin: '6px 0' }}>Quality & Cess</Divider>
          <Row gutter={12}>
            <Col span={8}><Form.Item label="MC Content (%)" name="moisturePct"><InputNumber min={0} max={100} style={{ width: '100%' }} step={0.1} /></Form.Item></Col>
            <Col span={8}><Form.Item label="Foreign Matter (%)" name="foreignMatterPct"><InputNumber min={0} max={100} style={{ width: '100%' }} step={0.1} /></Form.Item></Col>
          </Row>
          <Row gutter={12}>
            <Col span={8}>
              <Form.Item label="Cess Applicable" name="cessApplicable" valuePropName="checked" initialValue={false}>
                <Switch checkedChildren="Yes" unCheckedChildren="No" />
              </Form.Item>
            </Col>
            <Col span={16}>
              <Form.Item label="Cess Paid (₹)" name="cessPaid" extra={`Balance Cess = ${CESS_RATE * 100}% of Sale Value − Cess Paid (if Yes), or −Cess Paid (if No)`}>
                <InputNumber min={0} style={{ width: '100%' }} step={1} />
              </Form.Item>
            </Col>
          </Row>
          <Divider orientation="left" orientationMargin={0} style={{ margin: '6px 0' }}>Transporter</Divider>
          <Row gutter={12}>
            <Col span={12}><Form.Item label="Driver Name" name="driverName"><Input /></Form.Item></Col>
            <Col span={12}><Form.Item label="Driver Phone" name="driverPhone"><Input /></Form.Item></Col>
          </Row>
          <Form.Item label="Notes" name="notes"><Input.TextArea rows={2} /></Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

export default function DeliveriesPage() {
  const { data: deliveries = [] } = useDeliveries()
  const { data: commodities = [] } = useCommodities()

  // Build tabs: one per commodity that has deliveries, plus "Untagged" if any rows lack commodityId
  const commodityTabs = useMemo(() => {
    const countMap: Record<string, number> = {}
    let untagged = 0
    for (const d of deliveries) {
      if ((d as any).commodityId) countMap[(d as any).commodityId] = (countMap[(d as any).commodityId] ?? 0) + 1
      else untagged++
    }
    const tabs = commodities
      .filter((c: any) => countMap[c.id] != null || true) // show all commodities, even empty
      .map((c: any) => ({
        key: c.id,
        label: (
          <span>
            {c.name}
            {countMap[c.id] ? <Badge count={countMap[c.id]} size="small" color="#1677ff" style={{ marginLeft: 6 }} /> : null}
          </span>
        ),
        children: <DeliverySheet commodityId={c.id} commodityName={c.name} />,
      }))
    const allCount = deliveries.length
    const items = [
      {
        key: '__all__',
        label: <span>All <Badge count={allCount} size="small" color="#888" style={{ marginLeft: 6 }} /></span>,
        children: <DeliverySheet commodityId={null} commodityName="All" />,
      },
      ...tabs,
    ]
    if (untagged > 0) {
      items.push({
        key: '__untagged__',
        label: <span style={{ color: '#faad14' }}>Untagged <Badge count={untagged} size="small" color="#faad14" style={{ marginLeft: 6 }} /></span>,
        children: <DeliverySheet commodityId="__untagged__" commodityName="Untagged" />,
      })
    }
    return items
  }, [deliveries, commodities])

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <Typography.Title level={4} style={{ margin: 0 }}>Deliveries (Lorry Receipts)</Typography.Title>
      </div>
      <Tabs items={commodityTabs} type="card" size="small" />
    </div>
  )
}
