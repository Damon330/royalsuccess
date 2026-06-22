import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'react-hot-toast'
import App from './App'
import { AuthProvider } from './context/AuthContext'
import { ThemeProvider } from './context/ThemeContext'
import { queryClient } from './lib/queryClient'
import { initWebVitals, initGlobalErrorCapture } from './lib/telemetry'
import UpdatePrompt from './components/shared/UpdatePrompt'
import './index.css'

const ReactQueryDevtools = import.meta.env.DEV
  ? React.lazy(() => import('@tanstack/react-query-devtools').then((mod) => ({
      default: mod.ReactQueryDevtools,
    })))
  : null

initGlobalErrorCapture(() => {
  try { return sessionStorage.getItem('rs-uid') ?? undefined } catch { return undefined }
})
initWebVitals()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ThemeProvider>
          <AuthProvider>
            <App />
            <UpdatePrompt />
            <Toaster
              position="top-right"
              toastOptions={{
                duration: 4000,
                style: { fontFamily: 'Inter, sans-serif', fontSize: '14px' },
                success: { iconTheme: { primary: '#0F4C35', secondary: '#fff' } },
              }}
            />
          </AuthProvider>
        </ThemeProvider>
      </BrowserRouter>
      {ReactQueryDevtools && (
        <React.Suspense fallback={null}>
          <ReactQueryDevtools initialIsOpen={false} buttonPosition="bottom-left" />
        </React.Suspense>
      )}
    </QueryClientProvider>
  </React.StrictMode>,
)
