import axios from 'axios'
import { useAuthStore } from '../store/auth'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY
const FUNCTIONS_URL = `${SUPABASE_URL}/functions/v1`

const api = axios.create({ baseURL: FUNCTIONS_URL })

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token
  config.headers['apikey'] = SUPABASE_ANON_KEY
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      useAuthStore.getState().logout()
      window.location.href = '/login'
    }
    return Promise.reject(err)
  }
)

export default api
