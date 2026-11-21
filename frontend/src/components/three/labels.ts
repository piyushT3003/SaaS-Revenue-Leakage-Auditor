import * as THREE from 'three'

const cache = new Map<string, { tex: THREE.CanvasTexture; aspect: number }>()

/** Canvas-texture label for sprites (avoids drei <Html>, which warns on unmount and costs DOM work per frame). */
export function textTexture(text: string, opts: { color?: string; bg?: string | null; weight?: number; size?: number } = {}) {
  const { color = '#e6ecff', bg = 'rgba(11,19,48,0.88)', weight = 600, size = 30 } = opts
  const key = `${text}|${color}|${bg}|${weight}|${size}`
  const hit = cache.get(key)
  if (hit) return hit
  const c = document.createElement('canvas'), x = c.getContext('2d')!
  const font = `${weight} ${size}px Inter, system-ui, sans-serif`
  x.font = font
  const w = Math.ceil(x.measureText(text).width) + 28, h = Math.round(size * 1.55)
  c.width = w; c.height = h
  x.font = font
  if (bg) {
    x.fillStyle = bg; x.strokeStyle = 'rgba(255,255,255,0.14)'; x.lineWidth = 2
    x.beginPath(); x.roundRect(1, 1, w - 2, h - 2, 10); x.fill(); x.stroke()
  }
  x.fillStyle = color; x.textBaseline = 'middle'; x.fillText(text, 14, h / 2 + 1)
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4
  const out = { tex, aspect: w / h }
  cache.set(key, out)
  return out
}

/** Soft round glow texture for additive halos / particles. */
let glow: THREE.CanvasTexture | null = null
export function glowTexture() {
  if (glow) return glow
  const c = document.createElement('canvas'); c.width = c.height = 64
  const x = c.getContext('2d')!
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32)
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.25, 'rgba(255,255,255,0.65)'); g.addColorStop(1, 'rgba(255,255,255,0)')
  x.fillStyle = g; x.fillRect(0, 0, 64, 64)
  glow = new THREE.CanvasTexture(c)
  return glow
}
