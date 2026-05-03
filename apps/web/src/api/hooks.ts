import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from './client'

// Auth
export const useLogin = () => {
  return useMutation({
    mutationFn: (data: { email: string; password: string }) =>
      api.post('/auth/login', data).then((r) => r.data),
  })
}

// Suppliers
export const useSuppliers = (search?: string) =>
  useQuery({ queryKey: ['suppliers', search], queryFn: () => api.get('/suppliers', { params: { search } }).then(r => r.data) })

export const useSupplier = (id: string) =>
  useQuery({ queryKey: ['supplier', id], queryFn: () => api.get(`/suppliers/${id}`).then(r => r.data), enabled: !!id })

export const useCreateSupplier = () => {
  const qc = useQueryClient()
  return useMutation({ mutationFn: (data: any) => api.post('/suppliers', data).then(r => r.data), onSuccess: () => qc.invalidateQueries({ queryKey: ['suppliers'] }) })
}
export const useUpdateSupplier = () => {
  const qc = useQueryClient()
  return useMutation({ mutationFn: ({ id, ...data }: any) => api.put(`/suppliers/${id}`, data).then(r => r.data), onSuccess: () => qc.invalidateQueries({ queryKey: ['suppliers'] }) })
}
export const useDeleteSupplier = () => {
  const qc = useQueryClient()
  return useMutation({ mutationFn: (id: string) => api.delete(`/suppliers/${id}`).then(r => r.data), onSuccess: () => qc.invalidateQueries({ queryKey: ['suppliers'] }) })
}
export const useDeleteCustomer = () => {
  const qc = useQueryClient()
  return useMutation({ mutationFn: (id: string) => api.delete(`/customers/${id}`).then(r => r.data), onSuccess: () => qc.invalidateQueries({ queryKey: ['customers'] }) })
}

// Customers
export const useCustomers = () =>
  useQuery({ queryKey: ['customers'], queryFn: () => api.get('/customers').then(r => r.data) })
export const useCreateCustomer = () => {
  const qc = useQueryClient()
  return useMutation({ mutationFn: (data: any) => api.post('/customers', data).then(r => r.data), onSuccess: () => qc.invalidateQueries({ queryKey: ['customers'] }) })
}
export const useUpdateCustomer = () => {
  const qc = useQueryClient()
  return useMutation({ mutationFn: ({ id, ...data }: any) => api.put(`/customers/${id}`, data).then(r => r.data), onSuccess: () => qc.invalidateQueries({ queryKey: ['customers'] }) })
}

// Commodities
export const useCommodities = () =>
  useQuery({ queryKey: ['commodities'], queryFn: () => api.get('/commodities').then(r => r.data) })
export const useCreateCommodity = () => {
  const qc = useQueryClient()
  return useMutation({ mutationFn: (data: any) => api.post('/commodities', data).then(r => r.data), onSuccess: () => qc.invalidateQueries({ queryKey: ['commodities'] }) })
}
export const useUpdateCommodity = () => {
  const qc = useQueryClient()
  return useMutation({ mutationFn: ({ id, ...data }: any) => api.put(`/commodities/${id}`, data).then(r => r.data), onSuccess: () => qc.invalidateQueries({ queryKey: ['commodities'] }) })
}
export const useDeleteCommodity = () => {
  const qc = useQueryClient()
  return useMutation({ mutationFn: (id: string) => api.delete(`/commodities/${id}`).then(r => r.data), onSuccess: () => qc.invalidateQueries({ queryKey: ['commodities'] }) })
}

// Purchase Orders
export const usePurchaseOrders = (params?: any) =>
  useQuery({ queryKey: ['purchase-orders', params], queryFn: () => api.get('/purchase-orders', { params }).then(r => r.data) })
export const usePurchaseOrder = (id: string) =>
  useQuery({ queryKey: ['purchase-order', id], queryFn: () => api.get(`/purchase-orders/${id}`).then(r => r.data), enabled: !!id })
export const useCreatePurchaseOrder = () => {
  const qc = useQueryClient()
  return useMutation({ mutationFn: (data: any) => api.post('/purchase-orders', data).then(r => r.data), onSuccess: () => qc.invalidateQueries({ queryKey: ['purchase-orders'] }) })
}
export const useUpdatePurchaseOrder = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: any) => api.put(`/purchase-orders/${id}`, data).then(r => r.data),
    onSuccess: (updated) => {
      qc.setQueriesData({ queryKey: ['purchase-orders'] }, (old: any) =>
        Array.isArray(old) ? old.map((o: any) => o.id === updated.id ? { ...o, ...updated } : o) : old
      )
    },
  })
}
export const useDeletePurchaseOrder = () => {
  const qc = useQueryClient()
  return useMutation({ mutationFn: (id: string) => api.delete(`/purchase-orders/${id}`).then(r => r.data), onSuccess: () => qc.invalidateQueries({ queryKey: ['purchase-orders'] }) })
}

// Sales Orders
export const useSalesOrders = (params?: any) =>
  useQuery({ queryKey: ['sales-orders', params], queryFn: () => api.get('/sales-orders', { params }).then(r => r.data) })
export const useCreateSalesOrder = () => {
  const qc = useQueryClient()
  return useMutation({ mutationFn: (data: any) => api.post('/sales-orders', data).then(r => r.data), onSuccess: () => qc.invalidateQueries({ queryKey: ['sales-orders'] }) })
}
export const useUpdateSalesOrder = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: any) => api.put(`/sales-orders/${id}`, data).then(r => r.data),
    onSuccess: (updated) => {
      qc.setQueriesData({ queryKey: ['sales-orders'] }, (old: any) =>
        Array.isArray(old) ? old.map((o: any) => o.id === updated.id ? { ...o, ...updated } : o) : old
      )
    },
  })
}
export const useDeleteSalesOrder = () => {
  const qc = useQueryClient()
  return useMutation({ mutationFn: (id: string) => api.delete(`/sales-orders/${id}`).then(r => r.data), onSuccess: () => qc.invalidateQueries({ queryKey: ['sales-orders'] }) })
}

// Deliveries
export const useDeliveries = (params?: any) =>
  useQuery({ queryKey: ['deliveries', params], queryFn: () => api.get('/deliveries', { params }).then(r => r.data) })
export const useDelivery = (id: string) =>
  useQuery({ queryKey: ['delivery', id], queryFn: () => api.get(`/deliveries/${id}`).then(r => r.data), enabled: !!id })
export const useCreateDelivery = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: any) => api.post('/deliveries', data).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['deliveries'] })
      // Mark dashboard stale so it refreshes next time it's viewed, not immediately
      qc.invalidateQueries({ queryKey: ['reports', 'dashboard'], refetchType: 'none' })
    },
  })
}
export const useUpdateDelivery = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: any) => api.put(`/deliveries/${id}`, data).then(r => r.data),
    onSuccess: (updated) => {
      // Patch the cached list in-place — avoids a full refetch on every inline edit
      qc.setQueriesData({ queryKey: ['deliveries'] }, (old: any) =>
        Array.isArray(old) ? old.map((d: any) => d.id === updated.id ? { ...d, ...updated } : d) : old
      )
      qc.setQueryData(['delivery', updated.id], updated)
    },
  })
}
export const useDeleteDelivery = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.delete(`/deliveries/${id}`).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['deliveries'] })
      qc.invalidateQueries({ queryKey: ['reports', 'dashboard'], refetchType: 'none' })
    },
  })
}

// Payments
export const useSupplierPayments = (supplierId?: string) =>
  useQuery({ queryKey: ['supplier-payments', supplierId], queryFn: () => api.get('/payments/supplier', { params: { supplierId } }).then(r => r.data) })
export const useCreateSupplierPayment = () => {
  const qc = useQueryClient()
  return useMutation({ mutationFn: (data: any) => api.post('/payments/supplier', data).then(r => r.data), onSuccess: () => { qc.invalidateQueries({ queryKey: ['supplier-payments'] }); qc.invalidateQueries({ queryKey: ['supplier-ledger'] }); qc.invalidateQueries({ queryKey: ['reports', 'dashboard'], refetchType: 'none' }) } })
}
export const useSupplierLedger = (supplierId: string) =>
  useQuery({ queryKey: ['supplier-ledger', supplierId], queryFn: () => api.get(`/payments/supplier/${supplierId}/ledger`).then(r => r.data), enabled: !!supplierId })

export const useCustomerReceipts = (customerId?: string) =>
  useQuery({ queryKey: ['customer-receipts', customerId], queryFn: () => api.get('/payments/customer', { params: { customerId } }).then(r => r.data) })
export const useCreateCustomerReceipt = () => {
  const qc = useQueryClient()
  return useMutation({ mutationFn: (data: any) => api.post('/payments/customer', data).then(r => r.data), onSuccess: () => { qc.invalidateQueries({ queryKey: ['customer-receipts'] }); qc.invalidateQueries({ queryKey: ['customer-ledger'] }); qc.invalidateQueries({ queryKey: ['reports', 'dashboard'], refetchType: 'none' }) } })
}
export const useCustomerLedger = (customerId: string) =>
  useQuery({ queryKey: ['customer-ledger', customerId], queryFn: () => api.get(`/payments/customer/${customerId}/ledger`).then(r => r.data), enabled: !!customerId })

// Daily Rate lookup — used by deliveries form to auto-fill rates
export const useDailyRates = (date: string | null, commodityId: string | null) =>
  useQuery({
    queryKey: ['daily-rates', date, commodityId],
    queryFn: async () => {
      if (!date || !commodityId) return { purchaseRate: null, saleRate: null }
      const [pr, sr] = await Promise.all([
        api.get('/purchase-orders', { params: { date, commodityId } }).then(r => r.data?.[0]?.ratePerQuintal ?? null),
        api.get('/sales-orders', { params: { date, commodityId } }).then(r => r.data?.[0]?.ratePerQuintal ?? null),
      ])
      return { purchaseRate: pr, saleRate: sr }
    },
    enabled: !!date && !!commodityId,
    staleTime: 30000,
  })

// Reports
export const useDashboard = () =>
  useQuery({ queryKey: ['reports', 'dashboard'], queryFn: () => api.get('/reports/dashboard').then(r => r.data) })
export const usePnL = (params?: any) =>
  useQuery({ queryKey: ['reports', 'pnl', params], queryFn: () => api.get('/reports/pnl', { params }).then(r => r.data) })
export const useStockReport = () =>
  useQuery({ queryKey: ['reports', 'stock'], queryFn: () => api.get('/reports/stock').then(r => r.data) })

// Users
export const useUsers = () =>
  useQuery({ queryKey: ['users'], queryFn: () => api.get('/users').then(r => r.data) })
export const useCreateUser = () => {
  const qc = useQueryClient()
  return useMutation({ mutationFn: (data: any) => api.post('/users', data).then(r => r.data), onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }) })
}
export const useUpdateUser = () => {
  const qc = useQueryClient()
  return useMutation({ mutationFn: ({ id, ...data }: any) => api.put(`/users/${id}`, data).then(r => r.data), onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }) })
}
export const useDeleteUser = () => {
  const qc = useQueryClient()
  return useMutation({ mutationFn: (id: string) => api.delete(`/users/${id}`).then(r => r.data), onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }) })
}
