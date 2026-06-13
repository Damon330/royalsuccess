import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { Toaster } from 'react-hot-toast'
import App from './App'
import { AuthProvider } from './context/AuthContext'
import { queryClient } from './lib/queryClient'
import { initWebVitals, initGlobalErrorCapture } from './lib/telemetry'
import './index.css'

// Telemetry: global JS error capture starts immediately;
// Web Vitals are reported asynchronously as the browser fires each event.
initGlobalErrorCapture(() => {
  try { return sessionStorage.getItem('rs-uid') ?? undefined } catch { return undefined }
})
initWebVitals()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <App />
          <Toaster
            position="top-right"
            toastOptions={{
              duration: 4000,
              style: { fontFamily: 'Inter, sans-serif', fontSize: '14px' },
              success: { iconTheme: { primary: '#0F4C35', secondary: '#fff' } },
            }}
          />
        </AuthProvider>
      </BrowserRouter>
      {/* DevTools panel — tree-shaken from production bundle automatically */}
      <ReactQueryDevtools initialIsOpen={false} buttonPosition="bottom-left" />
    </QueryClientProvider>
  </React.StrictMode>
)
