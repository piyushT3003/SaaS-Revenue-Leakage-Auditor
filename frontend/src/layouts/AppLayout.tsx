import { AnimatePresence, MotionConfig, motion, useReducedMotion } from 'framer-motion'
import { useEffect, useState } from 'react'
import { useLocation, useOutlet } from 'react-router-dom'
import { DemoBanner } from '@/lib/demo'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { Cosmos } from '@/components/Cosmos'
import { ShellProvider } from '@/lib/shell'
import { useSpotlight } from '@/lib/spotlight'
import { Header } from './Header'
import { Sidebar } from './Sidebar'

/** The exiting page keeps rendering *its own* route during the exit animation instead of the new one,
 *  so a page never mounts twice (once inside the exiting wrapper) and never runs its effects twice. */
function FrozenOutlet() {
  const outlet = useOutlet()
  const [frozen] = useState(outlet)
  return frozen
}

/** Pages arrive from depth (slightly back, tilted and soft-focused) and recede the same way. */
const page = {
  initial: { opacity: 0, y: 22, scale: 0.985, rotateX: 5, filter: 'blur(6px)' },
  animate: { opacity: 1, y: 0, scale: 1, rotateX: 0, filter: 'blur(0px)' },
  exit: { opacity: 0, y: -12, scale: 0.99, rotateX: -2, filter: 'blur(4px)' },
}

export function AppLayout() {
  const loc = useLocation()
  useSpotlight()
  return (
    <MotionConfig reducedMotion="user">
      <ShellProvider>
        <div className="relative flex h-full overflow-hidden">
          <Cosmos />
          <Sidebar />
          <div className="relative z-10 flex min-w-0 flex-1 flex-col">
            <DemoBanner />
            <Header />
            <main id="main" className="scroll-thin relative flex-1 overflow-y-auto px-3 pb-6 pt-1 md:px-5 lg:px-7" style={{ perspective: 1400 }}>
              <AnimatePresence mode="wait">
                <motion.div key={loc.pathname} variants={page} initial="initial" animate="animate" exit="exit"
                  transition={{ duration: 0.42, ease: [0.16, 1, 0.3, 1] }} style={{ transformOrigin: '50% 0%' }}>
                  <ErrorBoundary resetKey={loc.pathname}><FrozenOutlet /></ErrorBoundary>
                </motion.div>
              </AnimatePresence>
            </main>
          </div>
          <Intro />
        </div>
      </ShellProvider>
    </MotionConfig>
  )
}

/** One-time cinematic intro after sign-in (once per browser session; skipped under reduced motion). */
function Intro() {
  const reduce = useReducedMotion()
  const [show, setShow] = useState(() => {
    try { return !sessionStorage.getItem('sra.intro') } catch { return false }
  })
  useEffect(() => {
    if (!show) return
    try { sessionStorage.setItem('sra.intro', '1') } catch { /* storage unavailable */ }
    const t = setTimeout(() => setShow(false), reduce ? 0 : 1700)
    return () => clearTimeout(t)
  }, [show, reduce])
  if (reduce) return null
  const bars = [13, 20, 26, 32]
  return (
    <AnimatePresence>
      {show && (
        <motion.div key="intro" className="fixed inset-0 z-[100] flex items-center justify-center bg-[#030714]"
          exit={{ opacity: 0, scale: 1.08, filter: 'blur(8px)' }} transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }} onClick={() => setShow(false)} aria-hidden>
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_45%,rgba(239,43,69,0.22),transparent_45%),radial-gradient(circle_at_50%_60%,rgba(47,123,255,0.18),transparent_55%)]" />
          <div className="relative flex flex-col items-center" style={{ perspective: 800 }}>
            <motion.svg width="120" height="112" viewBox="0 0 36 34" initial={{ rotateY: -70, rotateX: 25, scale: 0.6 }} animate={{ rotateY: 0, rotateX: 0, scale: 1 }}
              transition={{ duration: 1.1, ease: [0.16, 1, 0.3, 1] }} style={{ filter: 'drop-shadow(0 0 28px rgba(239,43,69,0.75))' }}>
              <defs><linearGradient id="ilg" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stopColor="#c81732" /><stop offset="1" stopColor="#ff4d63" /></linearGradient></defs>
              {bars.map((h, i) => (
                <motion.rect key={i} x={1 + i * 9} width="7" rx="1.5" fill="url(#ilg)" initial={{ height: 0, y: 33 }} animate={{ height: h, y: 33 - h }}
                  transition={{ delay: 0.15 + i * 0.12, duration: 0.6, ease: [0.16, 1, 0.3, 1] }} />
              ))}
            </motion.svg>
            <motion.div className="mt-6 text-center" initial={{ opacity: 0, y: 14, letterSpacing: '0.5em' }} animate={{ opacity: 1, y: 0, letterSpacing: '0.02em' }}
              transition={{ delay: 0.55, duration: 0.8, ease: [0.16, 1, 0.3, 1] }}>
              <div className="text-3xl font-bold text-white">SaaS Revenue <span className="text-shimmer">Assurance</span></div>
              <div className="mt-2 text-sm uppercase tracking-[0.3em] text-ink-muted">Every contract · every rupee</div>
            </motion.div>
            <motion.div className="mt-6 h-[2px] w-56 overflow-hidden rounded-full bg-white/10">
              <motion.div className="h-full bg-gradient-to-r from-accent-blue via-white to-accent-red" initial={{ x: '-100%' }} animate={{ x: '0%' }} transition={{ delay: 0.3, duration: 1.2, ease: 'easeInOut' }} />
            </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export function PageTitle({ first, accent, subtitle, actions }: { first: string; accent?: string; subtitle: string; actions?: React.ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div className="flex min-w-0 items-stretch gap-3 lg:gap-4">
        <motion.span className="w-[5px] rounded-full bg-accent-red shadow-red" aria-hidden initial={{ scaleY: 0 }} animate={{ scaleY: 1 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }} style={{ originY: 0 }} />
        <div className="min-w-0">
          <h1 className="text-[26px] font-bold leading-[1.15] tracking-tight text-white md:text-[30px] lg:text-[36px]">
            {first}{accent && <> <span className="text-shimmer">{accent}</span></>}
          </h1>
          <p className="text-[14px] text-ink lg:text-[16px]">{subtitle}</p>
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}
