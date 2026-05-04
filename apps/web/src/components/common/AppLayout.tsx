import { Layout, Typography, Button, Avatar, Dropdown, Badge } from 'antd'
import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import {
  DashboardOutlined, TeamOutlined, ShopOutlined,
  ShoppingCartOutlined, CarOutlined, DollarOutlined, BarChartOutlined,
  UserOutlined, LogoutOutlined, TagsOutlined, FileTextOutlined,
  BellOutlined,
} from '@ant-design/icons'
import { useAuthStore } from '../../store/auth'
import { useDashboard } from '../../api/hooks'

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
  const { user, logout } = useAuthStore()
  const { data: dashData } = useDashboard()

  const userMenuItems = [
    { key: 'profile', icon: <UserOutlined />, label: <span style={{ fontSize: 13 }}>{user?.email}</span>, disabled: true },
    { type: 'divider' as const },
    { key: 'logout', icon: <LogoutOutlined />, label: 'Logout', onClick: () => { logout(); navigate('/login') } },
  ]

  const untagged = 0 // could wire to delivery count later

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider width={220} className="app-sider" style={{ position: 'fixed', height: '100vh', left: 0, zIndex: 100, overflowY: 'auto' }}>
        {/* Logo */}
        <div style={{ padding: '18px 16px 14px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: 'linear-gradient(135deg, #43a047, #2e7d32)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>🌾</div>
            <div>
              <div style={{ color: '#fff', fontWeight: 700, fontSize: 13, lineHeight: 1.2 }}>Akshaya Agri</div>
              <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10 }}>Solutions</div>
            </div>
          </div>
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
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '0 14px', height: 38, margin: '1px 10px',
                    borderRadius: 7, cursor: 'pointer',
                    background: isActive ? 'rgba(46,125,50,0.55)' : 'transparent',
                    color: isActive ? '#fff' : 'rgba(255,255,255,0.62)',
                    fontWeight: isActive ? 600 : 400,
                    fontSize: 13,
                    transition: 'all 0.15s',
                  }}
                  onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.07)' }}
                  onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                >
                  <span style={{ fontSize: 15, opacity: isActive ? 1 : 0.7 }}>{item.icon}</span>
                  <span>{item.label}</span>
                </div>
              )
            })}
          </div>
        ))}

        {/* Bottom user info */}
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '12px 16px', borderTop: '1px solid rgba(255,255,255,0.08)', background: 'rgba(0,0,0,0.2)' }}>
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
      </Sider>

      <Layout style={{ marginLeft: 220 }}>
        <Header className="app-header">
          {/* Breadcrumb / page context */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {dashData && (
              <div style={{ display: 'flex', gap: 16 }}>
                <div style={{ fontSize: 12, color: '#888' }}>
                  Today: <span style={{ fontWeight: 600, color: '#1a1a1a' }}>{dashData.today?.deliveryCount ?? 0} deliveries</span>
                </div>
                <div style={{ fontSize: 12, color: '#888' }}>
                  Payable: <span style={{ fontWeight: 600, color: '#cf1322' }}>
                    ₹{Number(dashData.totalPayable ?? 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                  </span>
                </div>
                <div style={{ fontSize: 12, color: '#888' }}>
                  Receivable: <span style={{ fontWeight: 600, color: '#2e7d32' }}>
                    ₹{Number(dashData.totalReceivable ?? 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                  </span>
                </div>
              </div>
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
    </Layout>
  )
}
