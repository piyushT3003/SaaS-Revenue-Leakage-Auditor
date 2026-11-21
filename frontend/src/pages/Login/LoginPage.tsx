import { zodResolver } from '@hookform/resolvers/zod'
import { useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { Eye } from 'lucide-react'
import { lazy, Suspense, useState, type ReactNode } from 'react'
import { useForm } from 'react-hook-form'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { z } from 'zod'
import { Cosmos } from '@/components/Cosmos'
import { Button } from '@/components/ui'
import { Logo } from '@/layouts/Sidebar'
import { api } from '@/lib/api'
import { takeSessionNotice } from '@/lib/auth'
import { setDemoOptOut, useAuthOptions } from '@/lib/demo'
import { useCan3D } from '@/lib/webgl'

const RevenueGlobe = lazy(() => import('@/components/three/RevenueGlobe'))

const FEATURES = ['Contract-to-cash reconciliation', 'Revenue leakage detection', 'Customer unit economics', 'Evidence-backed AI investigation']

const PASSWORD_RULE = z.string().min(10, 'At least 10 characters').max(200)
  .refine((p) => !/^[A-Za-z]+$/.test(p) && !/^\d+$/.test(p), 'Mix letters and digits')

/** Shared frame for every signed-out screen: the 3D globe on the left, a card on the right. */
function AuthShell({ children }: { children: ReactNode }) {
  const can3D = useCan3D()
  return (
    <div className="relative flex min-h-full items-center justify-center gap-16 p-6">
      <Cosmos />
      <motion.div initial={{ opacity: 0, x: -30 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        className="relative z-10 hidden max-w-xl flex-1 flex-col items-center lg:flex">
        <div className="relative h-[420px] w-full">
          {can3D ? <Suspense fallback={null}><RevenueGlobe className="!absolute inset-0" /></Suspense>
            : <div className="absolute inset-12 rounded-full bg-[radial-gradient(circle_at_35%_30%,rgba(76,141,255,0.5),rgba(5,12,38,0.9)_60%)] shadow-[0_0_80px_rgba(76,141,255,0.35)]" />}
        </div>
        <h2 className="depth-text -mt-6 text-center text-4xl font-bold leading-tight">Every contract, <span className="text-accent-red">every rupee</span>,<br />accounted for.</h2>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          {FEATURES.map((f, i) => (
            <motion.span key={f} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 + i * 0.1 }}
              className="chip bg-white/5 text-ink-muted ring-1 ring-panel-border">{f}</motion.span>
          ))}
        </div>
      </motion.div>
      <motion.div initial={{ opacity: 0, y: 24, rotateX: 8 }} animate={{ opacity: 1, y: 0, rotateX: 0 }}
        transition={{ type: 'spring', stiffness: 160, damping: 20 }} style={{ transformPerspective: 1000 }}
        className="panel tilt relative z-10 w-full max-w-md space-y-5 p-8">
        <Logo />
        {children}
      </motion.div>
    </div>
  )
}

const Alert = ({ tone = 'error', children }: { tone?: 'error' | 'info' | 'ok'; children: ReactNode }) => (
  <p role={tone === 'error' ? 'alert' : 'status'} className={
    tone === 'error' ? 'rounded-md border border-accent-red/40 bg-accent-red/10 p-2 text-sm text-[#ff9aa6]'
      : tone === 'ok' ? 'rounded-md border border-accent-green/40 bg-accent-green/10 p-2 text-sm text-[#86efac]'
        : 'rounded-md border border-accent-blueSoft/40 bg-accent-blueSoft/10 p-2 text-sm text-[#bcd3ff]'}>{children}</p>
)

const signInSchema = z.object({ email: z.string().min(3).regex(/^[^@\s]+@[^@\s]+$/, 'Enter a valid email'), password: z.string().min(1, 'Password is required') })

function SignIn() {
  const qc = useQueryClient()
  const opts = useAuthOptions()
  const [error, setError] = useState('')
  const [notice] = useState(takeSessionNotice)
  const [demoBusy, setDemoBusy] = useState(false)
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<z.infer<typeof signInSchema>>({ resolver: zodResolver(signInSchema) })
  const signIn = async (path: string, body?: unknown) => {
    setError('')
    try {
      const r = await api.post<{ user: unknown }>(path, body)
      qc.setQueryData(['me'], r.user)
    } catch (e) { setError(e instanceof Error ? e.message : 'Sign-in failed') }
  }
  return (
    <form onSubmit={handleSubmit((f) => signIn('/auth/login', f))} noValidate className="space-y-5">
      <div><h1 className="text-2xl font-bold">Sign in</h1><p className="text-sm text-ink-muted">Contract-to-Cash &amp; Customer Unit Economics Auditor</p></div>
      {notice && <Alert tone="info">{notice}</Alert>}
      <div>
        <label className="label" htmlFor="email">Email</label>
        <input id="email" className="input" autoComplete="username" {...register('email')} />
        {errors.email && <p className="mt-1 text-xs text-[#ff8796]">{errors.email.message}</p>}
      </div>
      <div>
        <div className="flex items-baseline justify-between"><label className="label" htmlFor="password">Password</label>
          <Link to="/forgot-password" className="text-xs text-accent-blueSoft hover:underline">Forgot password?</Link></div>
        <input id="password" type="password" className="input" autoComplete="current-password" {...register('password')} />
        {errors.password && <p className="mt-1 text-xs text-[#ff8796]">{errors.password.message}</p>}
      </div>
      {error && <Alert>{error}</Alert>}
      <Button variant="red" type="submit" loading={isSubmitting} className="w-full py-2.5">Sign in</Button>
      {opts.data?.demo_login && (
        <Button type="button" loading={demoBusy} className="w-full py-2.5" onClick={async () => { setDemoBusy(true); setDemoOptOut(false); await signIn('/auth/demo-login'); setDemoBusy(false) }}>
          <Eye size={16} />View the demo (read-only)
        </Button>
      )}
      {opts.data?.synthetic_data && <p className="text-center text-[11px] text-ink-faint">Demonstration workspace — all customer and financial data is synthetic.</p>}
      <p className="text-center text-[11px] text-ink-faint"><Link to="/privacy" className="hover:underline">Privacy</Link> · <Link to="/terms" className="hover:underline">Terms</Link></p>
    </form>
  )
}

function Forgot() {
  const opts = useAuthOptions()
  const [done, setDone] = useState('')
  const [error, setError] = useState('')
  const schema = z.object({ email: z.string().regex(/^[^@\s]+@[^@\s]+$/, 'Enter a valid email') })
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema) })
  if (opts.data && !opts.data.password_reset_email) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">Reset your password</h1>
        <Alert tone="info">Email isn't set up for this workspace. Ask an administrator to create a reset link for you (Settings → Users → Reset link). It works once and expires after an hour.</Alert>
        <Link to="/" className="btn-ghost inline-flex">Back to sign in</Link>
      </div>
    )
  }
  return (
    <form noValidate className="space-y-5" onSubmit={handleSubmit(async (f) => {
      setError('')
      try { setDone((await api.post<{ message: string }>('/auth/forgot-password', f)).message) } catch (e) { setError(e instanceof Error ? e.message : 'Request failed') }
    })}>
      <div><h1 className="text-2xl font-bold">Reset your password</h1><p className="text-sm text-ink-muted">We'll email you a one-time link.</p></div>
      {done ? <Alert tone="ok">{done}</Alert> : (
        <>
          <div>
            <label className="label" htmlFor="email">Email</label>
            <input id="email" className="input" autoComplete="username" {...register('email')} />
            {errors.email && <p className="mt-1 text-xs text-[#ff8796]">{errors.email.message}</p>}
          </div>
          {error && <Alert>{error}</Alert>}
          <Button variant="red" type="submit" loading={isSubmitting} className="w-full py-2.5">Send reset link</Button>
        </>
      )}
      <Link to="/" className="block text-center text-sm text-accent-blueSoft hover:underline">Back to sign in</Link>
    </form>
  )
}

const resetSchema = z.object({ password: PASSWORD_RULE, confirm: z.string() }).refine((v) => v.password === v.confirm, { message: 'Passwords do not match', path: ['confirm'] })

function Reset() {
  const [params] = useSearchParams()
  const nav = useNavigate()
  const token = params.get('token') ?? ''
  const [done, setDone] = useState('')
  const [error, setError] = useState('')
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<z.infer<typeof resetSchema>>({ resolver: zodResolver(resetSchema) })
  if (!token) return <div className="space-y-4"><h1 className="text-2xl font-bold">Reset link missing</h1><Alert>Open the full link from your email or administrator.</Alert><Link to="/" className="btn-ghost inline-flex">Back to sign in</Link></div>
  return (
    <form noValidate className="space-y-5" onSubmit={handleSubmit(async (f) => {
      setError('')
      try { setDone((await api.post<{ message: string }>('/auth/reset-password', { token, new_password: f.password })).message) }
      catch (e) { setError(e instanceof Error ? e.message : 'Reset failed') }
    })}>
      <div><h1 className="text-2xl font-bold">Choose a new password</h1><p className="text-sm text-ink-muted">At least 10 characters, mixing letters and digits. You'll be signed out everywhere.</p></div>
      {done ? (
        <><Alert tone="ok">{done}</Alert><Button variant="red" type="button" className="w-full py-2.5" onClick={() => nav('/', { replace: true })}>Go to sign in</Button></>
      ) : (
        <>
          <div>
            <label className="label" htmlFor="new-password">New password</label>
            <input id="new-password" type="password" className="input" autoComplete="new-password" {...register('password')} />
            {errors.password && <p className="mt-1 text-xs text-[#ff8796]">{errors.password.message}</p>}
          </div>
          <div>
            <label className="label" htmlFor="confirm-password">Confirm new password</label>
            <input id="confirm-password" type="password" className="input" autoComplete="new-password" {...register('confirm')} />
            {errors.confirm && <p className="mt-1 text-xs text-[#ff8796]">{errors.confirm.message}</p>}
          </div>
          {error && <Alert>{error}</Alert>}
          <Button variant="red" type="submit" loading={isSubmitting} className="w-full py-2.5">Set new password</Button>
        </>
      )}
    </form>
  )
}

/** Signed-out screens: sign in, forgot password, reset password (chosen by URL). */
export default function LoginPage() {
  const { pathname } = useLocation()
  return <AuthShell>{pathname === '/forgot-password' ? <Forgot /> : pathname === '/reset-password' ? <Reset /> : <SignIn />}</AuthShell>
}

export { PASSWORD_RULE }
