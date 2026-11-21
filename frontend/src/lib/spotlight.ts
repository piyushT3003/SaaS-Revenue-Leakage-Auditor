import { useEffect } from 'react'

/** Feeds each visible .panel its own cursor position (--px/--py, in px from its top-left) so the CSS border
 *  spotlight can follow the pointer across panels. One rAF-throttled listener; nothing runs while idle,
 *  and nothing at all under reduced motion or on touch-only devices. */
export function useSpotlight() {
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || !window.matchMedia('(hover: hover)').matches) return
    let raf = 0, x = 0, y = 0
    const paint = () => {
      raf = 0
      document.querySelectorAll<HTMLElement>('.panel').forEach((el) => {
        const r = el.getBoundingClientRect()
        const near = x > r.left - 300 && x < r.right + 300 && y > r.top - 300 && y < r.bottom + 300
        if (near) { el.style.setProperty('--px', `${x - r.left}px`); el.style.setProperty('--py', `${y - r.top}px`); el.dataset.lit = '1' }
        else if (el.dataset.lit) { delete el.dataset.lit }
      })
    }
    const move = (e: PointerEvent) => { x = e.clientX; y = e.clientY; if (!raf) raf = requestAnimationFrame(paint) }
    window.addEventListener('pointermove', move, { passive: true })
    return () => { window.removeEventListener('pointermove', move); if (raf) cancelAnimationFrame(raf) }
  }, [])
}
