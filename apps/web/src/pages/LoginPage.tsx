import { Form, Input, Button, message } from 'antd'
import { LockOutlined, MailOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { useLogin } from '../api/hooks'
import { useAuthStore } from '../store/auth'
import { BRAND } from '../utils/brand'

export default function LoginPage() {
  const navigate = useNavigate()
  const { mutateAsync: login, isPending } = useLogin()
  const setAuth = useAuthStore((s) => s.setAuth)

  async function onFinish(values: { email: string; password: string }) {
    try {
      const data = await login(values)
      setAuth(data.token, data.user)
      navigate('/')
    } catch {
      message.error('Invalid email or password')
    }
  }

  return (
    <div className="login-shell">
      <div className="login-card">
        <div className="login-logo">
          <img src={BRAND.logoUrl} alt={BRAND.name} />
          <div className="login-subtitle">Sign in to your account</div>
        </div>
        <Form layout="vertical" onFinish={onFinish} requiredMark={false}>
          <Form.Item label="Email" name="email" rules={[{ required: true, type: 'email', message: 'Enter a valid email' }]}>
            <Input size="large" prefix={<MailOutlined style={{ color: '#bbb' }} />} placeholder="you@akshayaagri.com" autoComplete="email" />
          </Form.Item>
          <Form.Item label="Password" name="password" rules={[{ required: true, message: 'Password is required' }]}>
            <Input.Password size="large" prefix={<LockOutlined style={{ color: '#bbb' }} />} placeholder="Password" autoComplete="current-password" />
          </Form.Item>
          <Form.Item style={{ marginBottom: 8 }}>
            <Button type="primary" htmlType="submit" size="large" block loading={isPending}>
              Sign In
            </Button>
          </Form.Item>
        </Form>
        <div style={{ textAlign: 'center', fontSize: 11, color: '#a8a8a8', marginTop: 18 }}>
          © {new Date().getFullYear()} {BRAND.name}
        </div>
      </div>
    </div>
  )
}
