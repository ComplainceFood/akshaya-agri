import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ConfigProvider } from 'antd'
import App from './App'
import './index.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 60000,          // data stays fresh for 60s - no silent background refetches
      refetchOnWindowFocus: false, // clicking back into the tab won't cold-start Supabase functions
    },
  },
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <ConfigProvider
        theme={{
          token: {
            colorPrimary: '#2e7d32',
            colorLink: '#2e7d32',
            colorSuccess: '#2e7d32',
            colorError: '#cf1322',
            colorWarning: '#d97706',
            colorInfo: '#1677ff',
            colorBgLayout: '#f5f6fa',
            fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
            borderRadius: 8,
            fontSize: 13,
            controlHeight: 34,
          },
          components: {
            Button: { controlHeight: 34, fontWeight: 500 },
            Table: { headerBg: '#fafbfc', headerColor: '#666', cellPaddingBlock: 10, cellPaddingInline: 12 },
            Card: { paddingLG: 18 },
            Tabs: { itemSelectedColor: '#2e7d32', inkBarColor: '#2e7d32', itemHoverColor: '#43a047' },
          },
        }}
      >
        <App />
      </ConfigProvider>
    </QueryClientProvider>
  </React.StrictMode>
)
