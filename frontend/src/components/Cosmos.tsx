import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { useReducedMotion } from 'framer-motion'
import { webglOK } from '@/lib/webgl'

/** Layered cosmic backdrop: CSS nebula/planet layers + a lightweight canvas starfield with
 *  multi-layer parallax and a cursor spotlight. Pointer-events are disabled so it never blocks UI. */
const GalaxyScene = lazy(() => import('./three/GalaxyScene'))


/** Uses the WebGL galaxy when the device supports it and the user hasn't asked for reduced motion;
 *  otherwise falls back to the lightweight 2D canvas starfield below. */
export function Cosmos({ disabled = false, intensity = 1 }: { disabled?: boolean; intensity?: number }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const reduce = useReducedMotion() || disabled
  const [gl] = useState(() => !reduce && typeof window !== 'undefined' && webglOK())
  const [visible, setVisible] = useState(true)
  useEffect(() => {
    const v = () => setVisible(document.visibilityState === 'visible')
    document.addEventListener('visibilitychange', v)
    return () => document.removeEventListener('visibilitychange', v)
  }, [])
  useEffect(() => {
    const c = canvas.current
    const setVars = (e: PointerEvent) => {
      document.documentElement.style.setProperty('--mx', `${e.clientX}px`)
      document.documentElement.style.setProperty('--my', `${e.clientY}px`)
    }
    if (gl) {
      window.addEventListener('pointermove', setVars, { passive: true })
      return () => window.removeEventListener('pointermove', setVars)
    }
    if (!c) return
    const ctx = c.getContext('2d')
    if (!ctx) return
    let w = 0, h = 0, raf = 0, px = 0, py = 0
    const stars = Array.from({ length: 220 }, (_, i) => ({ x: Math.random(), y: Math.random(), z: (i % 3) + 1, r: Math.random() * 1.2 + 0.2, t: Math.random() * 6.28 }))
    const resize = () => { w = c.width = window.innerWidth * devicePixelRatio; h = c.height = window.innerHeight * devicePixelRatio }
    const onMove = (e: PointerEvent) => {
      px = e.clientX / window.innerWidth - 0.5; py = e.clientY / window.innerHeight - 0.5
      document.documentElement.style.setProperty('--mx', `${e.clientX}px`)
      document.documentElement.style.setProperty('--my', `${e.clientY}px`)
      if (!reduce) {
        document.documentElement.style.setProperty('--parallax-x', `${px * -18}px`)
        document.documentElement.style.setProperty('--parallax-y', `${py * -12}px`)
      }
    }
    const draw = (time: number) => {
      ctx.clearRect(0, 0, w, h)
      for (const s of stars) {
        const x = (s.x * w + px * s.z * 14 * devicePixelRatio + w) % w
        const y = (s.y * h + py * s.z * 10 * devicePixelRatio + h) % h
        const tw = reduce ? 0.8 : 0.55 + 0.45 * Math.sin(time / 900 + s.t)
        ctx.globalAlpha = tw * (0.35 + s.z * 0.18)
        ctx.fillStyle = s.z === 3 ? '#cfe0ff' : '#8fb0ff'
        ctx.beginPath(); ctx.arc(x, y, s.r * devicePixelRatio * (s.z / 2), 0, 6.283); ctx.fill()
      }
      if (!reduce) raf = requestAnimationFrame(draw)
    }
    resize(); draw(0)
    window.addEventListener('resize', resize)
    window.addEventListener('pointermove', onMove, { passive: true })
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize); window.removeEventListener('pointermove', onMove) }
  }, [reduce, gl])
  return (
    <>
      <div className="cosmos" aria-hidden>
        <div className="nebula" />
        {gl ? (
          <Suspense fallback={null}><GalaxyScene intensity={intensity} active={visible} /></Suspense>
        ) : (<><div className="planet" /><canvas ref={canvas} className="absolute inset-0 h-full w-full" /></>)}
      </div>
      {!reduce && <div className="cursor-spotlight" aria-hidden />}
    </>
  )
}
