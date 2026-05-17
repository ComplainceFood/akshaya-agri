import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './store/auth'
import AppLayout from './components/common/AppLayout'
import LoginPage from './pages/LoginPage'
import Dashboard from './pages/dashboard/Dashboard'
import SuppliersPage from './pages/suppliers/SuppliersPage'
import CustomersPage from './pages/customers/CustomersPage'
import CommoditiesPage from './pages/commodities/CommoditiesPage'
import PurchaseOrdersPage from './pages/purchase-orders/PurchaseOrdersPage'
import SalesOrdersPage from './pages/sales-orders/SalesOrdersPage'
import DeliveriesPage from './pages/deliveries/DeliveriesPage'
import PaymentsPage from './pages/payments/PaymentsPage'
import ReportsPage from './pages/reports/ReportsPage'
import InvoicesPage from './pages/invoices/InvoicesPage'
import UsersPage from './pages/UsersPage'
import LedgerPage from './pages/ledger/LedgerPage'

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const token = useAuthStore((s) => s.token)
  return token ? <>{children}</> : <Navigate to="/login" replace />
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/"
          element={
            <PrivateRoute>
              <AppLayout />
            </PrivateRoute>
          }
        >
          <Route index element={<Dashboard />} />
          <Route path="suppliers" element={<SuppliersPage />} />
          <Route path="customers" element={<CustomersPage />} />
          <Route path="commodities" element={<CommoditiesPage />} />
          <Route path="purchase-orders" element={<PurchaseOrdersPage />} />
          <Route path="sales-orders" element={<SalesOrdersPage />} />
          <Route path="deliveries" element={<DeliveriesPage />} />
          <Route path="payments" element={<PaymentsPage />} />
          <Route path="invoices" element={<InvoicesPage />} />
          <Route path="reports" element={<ReportsPage />} />
          <Route path="ledger" element={<LedgerPage />} />
          <Route path="users" element={<UsersPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
