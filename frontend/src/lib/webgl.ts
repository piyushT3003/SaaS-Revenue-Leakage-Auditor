import { useReducedMotion } from 'framer-motion'
import { useState } from 'react'

let cached: boolean | null = null
/** True when WebGL2 is available. Checked once per page load. */
export function webglOK(): boolean {
  if (cached !== null) return cached
  try {
    const c = document.createElement('canvas')
    cached = !!(window.WebGL2RenderingContext && c.getContext('webgl2'))
  } catch { cached = false }
  return cached
}
/** 3D effects run only with WebGL2 and when the user has not asked for reduced motion. */
export function useCan3D(): boolean {
  const reduce = useReducedMotion()
  const [ok] = useState(() => typeof window !== 'undefined' && webglOK())
  return ok && !reduce
}
