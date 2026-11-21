import { MutationCache, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { initMonitoring } from '@/lib/monitoring'
import { BrowserRouter } from 'react-router-dom'
import { Toaster, toast } from 'sonner'
import App from './App'
import './index.css'

const client = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: false, retry: (n, e) => n < 1 && (e as { status?: number }).status !== 401 } },
  // Every failed action surfaces as a toast, in addition to any inline error the screen shows.
  mutationCache: new MutationCache({
    onError: (error) => {
      if ((error as { status?: number }).status === 401) return
      toast.error('Action failed', { description: error instanceof Error ? error.message : 'Something went wrong' })
    },
  }),
})

void initMonitoring()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={client}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
      <Toaster position="bottom-right" theme="dark" richColors closeButton
        toastOptions={{ style: { background: 'rgba(11,19,48,0.92)', border: '1px solid rgba(76,141,255,0.35)', backdropFilter: 'blur(14px)', color: '#e6ecff' } }} />
    </QueryClientProvider>
  </StrictMode>,
)
