import { Layout, Button, Avatar, Dropdown, Modal, Form, Input, message } from 'antd'
import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import {
  DashboardOutlined, TeamOutlined, ShopOutlined,
  ShoppingCartOutlined, CarOutlined, DollarOutlined, BarChartOutlined,
  UserOutlined, LogoutOutlined, TagsOutlined, FileTextOutlined,
  LockOutlined, BookOutlined,
} from '@ant-design/icons'
import { useAuthStore } from '../../store/auth'
import { useDashboard } from '../../api/hooks'
import { BRAND } from '../../utils/brand'
import { useState } from 'react'

const { Header, Sider, Content } = Layout

type NavItem = { key: string; icon: React.ReactNode; label: string }
type Section = { label: string; items: NavItem[] }

const navSections: Section[] = [
  {
    label: 'Operations',
    items: [
      { key: '/', icon: <DashboardOutlined />, label: 'Dashboard' },
      { key: '/deliveries', icon: <CarOutlined />, label: 'Deliveries' },
      { key: '/purchase-orders', icon: <ShoppingCartOutlined />, label: 'Purchase Rates' },
      { key: '/sales-orders', icon: <ShopOutlined />, label: 'Sale Rates' },
      { key: '/payments', icon: <DollarOutlined />, label: 'Payments' },
      { key: '/invoices', icon: <FileTextOutlined />, label: 'Invoices' },
      { key: '/reports', icon: <BarChartOutlined />, label: 'Reports' },
      { key: '/ledger', icon: <BookOutlined />, label: 'Ledger' },
    ],
  },
  {
    label: 'Master Data',
    items: [
      { key: '/suppliers', icon: <TeamOutlined />, label: 'Suppliers' },
      { key: '/customers', icon: <ShopOutlined />, label: 'Customers' },
      { key: '/commodities', icon: <TagsOutlined />, label: 'Commodities' },
      { key: '/users', icon: <UserOutlined />, label: 'Users' },
    ],
  },
]

export default function AppLayout() {
  const navigate = useNavigate()
  const location = useLocation()
  const { user, logout, token } = useAuthStore()
  const { data: dashData } = useDashboard()
  const [pwModal, setPwModal] = useState(false)
  const [pwForm] = Form.useForm()
  const [pwLoading, setPwLoading] = useState(false)

  async function handleChangePassword(values: { newPassword: string }) {
    setPwLoading(true)
    try {
      const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
      const SERVICE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY
      const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SERVICE_KEY,
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ password: values.newPassword }),
      })
      if (!res.ok) throw new Error('Failed')
      message.success('Password changed successfully')
      setPwModal(false)
      pwForm.resetFields()
    } catch {
      message.error('Failed to change password')
    } finally {
      setPwLoading(false)
    }
  }

  const userMenuItems = [
    { key: 'email', icon: <UserOutlined />, label: <span style={{ fontSize: 13 }}>{user?.email}</span>, disabled: true },
    { type: 'divider' as const },
    { key: 'password', icon: <LockOutlined />, label: 'Change Password', onClick: () => setPwModal(true) },
    { type: 'divider' as const },
    { key: 'logout', icon: <LogoutOutlined />, label: 'Logout', onClick: () => { logout(); navigate('/login') } },
  ]

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider width={220} className="app-sider" style={{ position: 'fixed', height: '100vh', left: 0, zIndex: 100, overflowY: 'auto' }}>
        {/* Brand — wide horizontal logo, no surrounding text */}
        <div className="brand-block">
          <img src={BRAND.logoUrl} alt={BRAND.name} className="brand-block-logo-img" />
        </div>

        {/* Nav sections */}
        {navSections.map(section => (
          <div key={section.label}>
            <div className="nav-section">{section.label}</div>
            {section.items.map(item => {
              const isActive = item.key === '/'
                ? location.pathname === '/'
                : location.pathname.startsWith(item.key)
              return (
                <div
                  key={item.key}
                  onClick={() => navigate(item.key)}
                  className={`nav-item${isActive ? ' active' : ''}`}
                >
                  <span className="nav-icon">{item.icon}</span>
                  <span>{item.label}</span>
                </div>
              )
            })}
          </div>
        ))}

        {/* Bottom user info */}
        <Dropdown menu={{ items: userMenuItems }} placement="topLeft" trigger={['click']}>
          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '12px 16px', borderTop: '1px solid rgba(255,255,255,0.07)', background: 'rgba(0,0,0,0.25)', cursor: 'pointer' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Avatar size={28} style={{ background: '#2e7d32', fontSize: 12, flexShrink: 0 }}>
                {user?.name?.charAt(0)?.toUpperCase()}
              </Avatar>
              <div style={{ overflow: 'hidden' }}>
                <div style={{ color: '#fff', fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user?.name}</div>
                <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10 }}>{user?.role}</div>
              </div>
            </div>
          </div>
        </Dropdown>
      </Sider>

      <Layout style={{ marginLeft: 220 }}>
        <Header className="app-header">
          {/* Header stat pills */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 22 }}>
            {dashData && (
              <>
                <div style={{ fontSize: 12, color: '#7a8290', display: 'flex', alignItems: 'baseline', gap: 6 }}>
                  <span style={{ textTransform: 'uppercase', letterSpacing: 0.5, fontSize: 10, fontWeight: 600 }}>Today</span>
                  <span style={{ fontWeight: 700, color: '#1a1a1a' }}>{dashData.today?.deliveryCount ?? 0}</span>
                  <span style={{ color: '#9aa2ad' }}>deliveries</span>
                </div>
                <div style={{ width: 1, height: 18, background: '#eaecef' }} />
                <div style={{ fontSize: 12, color: '#7a8290', display: 'flex', alignItems: 'baseline', gap: 6 }}>
                  <span style={{ textTransform: 'uppercase', letterSpacing: 0.5, fontSize: 10, fontWeight: 600 }}>Payable</span>
                  <span style={{ fontWeight: 700, color: '#cf1322' }}>
                    ₹{Number(dashData.totalPayable ?? 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                  </span>
                </div>
                <div style={{ width: 1, height: 18, background: '#eaecef' }} />
                <div style={{ fontSize: 12, color: '#7a8290', display: 'flex', alignItems: 'baseline', gap: 6 }}>
                  <span style={{ textTransform: 'uppercase', letterSpacing: 0.5, fontSize: 10, fontWeight: 600 }}>Receivable</span>
                  <span style={{ fontWeight: 700, color: '#2e7d32' }}>
                    ₹{Number(dashData.totalReceivable ?? 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                  </span>
                </div>
              </>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Dropdown menu={{ items: userMenuItems }} placement="bottomRight" trigger={['click']}>
              <Button type="text" style={{ display: 'flex', alignItems: 'center', gap: 8, height: 40, padding: '0 10px', borderRadius: 8 }}>
                <Avatar size={28} style={{ background: '#2e7d32', fontSize: 12 }}>
                  {user?.name?.charAt(0)?.toUpperCase()}
                </Avatar>
                <span style={{ fontSize: 13, fontWeight: 500 }}>{user?.name}</span>
              </Button>
            </Dropdown>
          </div>
        </Header>

        <Content className="app-content">
          <Outlet />
        </Content>
      </Layout>

      <Modal title="Change Password" open={pwModal} onCancel={() => { setPwModal(false); pwForm.resetFields() }}
        onOk={() => pwForm.submit()} okText="Update Password" confirmLoading={pwLoading}>
        <Form form={pwForm} layout="vertical" onFinish={handleChangePassword} style={{ marginTop: 16 }}>
          <Form.Item name="newPassword" label="New Password"
            rules={[{ required: true, min: 8, message: 'Minimum 8 characters' }]}>
            <Input.Password placeholder="Enter new password" />
          </Form.Item>
          <Form.Item name="confirm" label="Confirm Password"
            dependencies={['newPassword']}
            rules={[{ required: true }, ({ getFieldValue }) => ({
              validator(_, value) {
                if (!value || getFieldValue('newPassword') === value) return Promise.resolve()
                return Promise.reject('Passwords do not match')
              }
            })]}>
            <Input.Password placeholder="Confirm new password" />
          </Form.Item>
        </Form>
      </Modal>
    </Layout>
  )
}
