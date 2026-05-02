import { Layout, Menu, Typography, Button, Avatar, Dropdown } from 'antd'
import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import {
  DashboardOutlined, TeamOutlined, ShopOutlined, AppstoreOutlined,
  ShoppingCartOutlined, CarOutlined, DollarOutlined, BarChartOutlined,
  UserOutlined, LogoutOutlined, TagsOutlined,
} from '@ant-design/icons'
import { useAuthStore } from '../../store/auth'

const { Header, Sider, Content } = Layout

const menuItems = [
  { key: '/', icon: <DashboardOutlined />, label: 'Dashboard' },
  { key: '/deliveries', icon: <CarOutlined />, label: 'Deliveries' },
  { key: '/purchase-orders', icon: <ShoppingCartOutlined />, label: 'Purchase Orders' },
  { key: '/sales-orders', icon: <ShopOutlined />, label: 'Sales Orders' },
  { key: '/payments', icon: <DollarOutlined />, label: 'Payments' },
  { key: '/reports', icon: <BarChartOutlined />, label: 'Reports' },
  { type: 'divider' as const },
  { key: '/suppliers', icon: <TeamOutlined />, label: 'Suppliers' },
  { key: '/customers', icon: <ShopOutlined />, label: 'Customers' },
  { key: '/commodities', icon: <TagsOutlined />, label: 'Commodities' },
  { key: '/users', icon: <UserOutlined />, label: 'Users' },
]

export default function AppLayout() {
  const navigate = useNavigate()
  const location = useLocation()
  const { user, logout } = useAuthStore()

  const userMenuItems = [
    { key: 'logout', icon: <LogoutOutlined />, label: 'Logout', onClick: () => { logout(); navigate('/login') } },
  ]

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider width={220} theme="dark" style={{ position: 'fixed', height: '100vh', left: 0, zIndex: 100 }}>
        <div style={{ padding: '16px', textAlign: 'center', borderBottom: '1px solid #2d4a2d' }}>
          <Typography.Text strong style={{ color: '#fff', fontSize: 14 }}>
            Akshaya Agri Solutions
          </Typography.Text>
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[location.pathname]}
          onClick={({ key }) => navigate(key)}
          items={menuItems as any}
          style={{ marginTop: 8 }}
        />
      </Sider>
      <Layout style={{ marginLeft: 220 }}>
        <Header style={{ background: '#fff', padding: '0 24px', display: 'flex', justifyContent: 'flex-end', alignItems: 'center', boxShadow: '0 1px 4px rgba(0,0,0,0.1)' }}>
          <Dropdown menu={{ items: userMenuItems }} placement="bottomRight">
            <Button type="text" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Avatar size="small" icon={<UserOutlined />} style={{ background: '#2e7d32' }} />
              <span>{user?.name}</span>
            </Button>
          </Dropdown>
        </Header>
        <Content style={{ margin: 24, minHeight: 'calc(100vh - 112px)' }}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  )
}
