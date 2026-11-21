import { lazy, Suspense, useCallback, useState } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { Spinner } from '@/components/ui'
import { AuthProvider, useAuth } from '@/lib/auth'
import { DemoEntry, demoOptedOut, useAuthOptions } from '@/lib/demo'
import { PeriodProvider } from '@/lib/period'
import { AppLayout } from '@/layouts/AppLayout'
import LoginPage from '@/pages/Login/LoginPage'

const Overview = lazy(() => import('@/pages/Overview/OverviewPage'))
const Reconciliation = lazy(() => import('@/pages/Reconciliation/ReconciliationPage'))
const Exceptions = lazy(() => import('@/pages/Exceptions/ExceptionsPage'))
const Customers = lazy(() => import('@/pages/Customers/CustomersPage'))
const CustomerProfile = lazy(() => import('@/pages/Customers/CustomerProfile'))
const Billing = lazy(() => import('@/pages/Billing/BillingPage'))
const UnitEconomics = lazy(() => import('@/pages/UnitEconomics/UnitEconomicsPage'))
const AIAssistant = lazy(() => import('@/pages/AIAssistant/AIAssistantPage'))
const DataManagement = lazy(() => import('@/pages/DataManagement/DataManagementPage'))
const Settings = lazy(() => import('@/pages/Settings/SettingsPage'))

const LegalPage = lazy(() => import('./pages/Legal/LegalPage'))
const PUBLIC_PATHS = ['/forgot-password', '/reset-password']
const LEGAL_PATHS = ['/privacy', '/terms']

function Guarded() {
  const { me, loading } = useAuth()
  const { pathname } = useLocation()
  const opts = useAuthOptions()
  const [demoFailed, setDemoFailed] = useState(false)
  const onDemoFail = useCallback(() => setDemoFailed(true), [])
  if (LEGAL_PATHS.includes(pathname)) return <Suspense fallback={<Spinner />}><LegalPage /></Suspense>
  if (PUBLIC_PATHS.includes(pathname)) return <LoginPage />  // reachable signed in or out
  if (loading) return <Spinner label="Checking session…" />
  if (!me) {
    if (opts.isLoading) return <Spinner label="Checking session…" />
    if (opts.data?.demo_auto && !demoFailed && !demoOptedOut()) return <DemoEntry onFail={onDemoFail} />
    return <LoginPage />
  }
  return (
    <PeriodProvider>
      <Routes>
        <Route element={<AppLayout />}>
          <Route index element={<Suspense fallback={<Spinner />}><Overview /></Suspense>} />
          <Route path="reconciliation" element={<Suspense fallback={<Spinner />}><Reconciliation /></Suspense>} />
          <Route path="exceptions" element={<Suspense fallback={<Spinner />}><Exceptions /></Suspense>} />
          <Route path="customers" element={<Suspense fallback={<Spinner />}><Customers /></Suspense>} />
          <Route path="customers/:id" element={<Suspense fallback={<Spinner />}><CustomerProfile /></Suspense>} />
          <Route path="billing" element={<Suspense fallback={<Spinner />}><Billing /></Suspense>} />
          <Route path="unit-economics" element={<Suspense fallback={<Spinner />}><UnitEconomics /></Suspense>} />
          <Route path="ai" element={<Suspense fallback={<Spinner />}><AIAssistant /></Suspense>} />
          <Route path="data" element={<Suspense fallback={<Spinner />}><DataManagement /></Suspense>} />
          <Route path="settings" element={<Suspense fallback={<Spinner />}><Settings /></Suspense>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </PeriodProvider>
  )
}

export default function App() {
  return <AuthProvider><Guarded /></AuthProvider>
}
