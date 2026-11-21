import { Canvas, useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { inrCompact } from '@/lib/format'
import { useFitWidth } from './fit'
import { glowTexture, textTexture } from './labels'

export interface FlowFigures { expected: number; invoiced: number; underbilled: number; overbilled: number; collected: number; collectible: number }

const G = [-6, -2, 2, 6] // Contract, Expected, Invoiced, Paid
const N = 950
const R = 0.55
const C = {
  blue: new THREE.Color('#4c8dff'), red: new THREE.Color('#ff2e4c'), violet: new THREE.Color('#a78bfa'),
  amber: new THREE.Color('#f5a524'), green: new THREE.Color('#22c55e'),
}
type Kind = 0 | 1 | 2 | 3 | 4 // 0 matched, 1 leak (under-billed), 2 over-billed, 3 unpaid, 4 paid

/** Visual rate for a ratio: proportional, but any non-zero amount stays visible (floor), capped so the tunnel still reads. */
const rate = (num: number, den: number, floor = 0.035) => (den > 0 && num > 0 ? Math.min(0.6, Math.max(floor, num / den)) : 0)

function Particles({ f }: { f: FlowFigures }) {
  const pLeak = rate(f.underbilled, f.expected)
  const pOver = rate(f.overbilled, f.expected)
  const pPaid = f.collectible > 0 ? (f.collected > 0 ? Math.max(0.02, f.collected / f.collectible) : 0) : 0
  const nOver = Math.round(N * pOver * 0.6)
  const st = useMemo(() => {
    const pos = new Float32Array(N * 3), col = new Float32Array(N * 3)
    const vx = new Float32Array(N), vy = new Float32Array(N), kind = new Uint8Array(N), fate = new Float32Array(N)
    return { pos, col, vx, vy, kind, fate }
  }, [])
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(st.pos, 3))
    g.setAttribute('color', new THREE.BufferAttribute(st.col, 3))
    return g
  }, [st])
  const spawn = (i: number, x?: number) => {
    const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * R
    const over = i < nOver
    st.pos[i * 3] = x ?? (over ? G[2] : G[0] - 1 - Math.random() * 0.5)
    st.pos[i * 3 + 1] = over && x === undefined ? 1.2 + Math.random() * 0.4 : Math.cos(a) * r
    st.pos[i * 3 + 2] = Math.sin(a) * r
    st.vx[i] = 1.35 + Math.random() * 0.5
    st.vy[i] = over && x === undefined ? -1.6 : 0
    st.kind[i] = over ? 2 : 0
    st.fate[i] = Math.random()
  }
  const seeded = useRef(false)
  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05)
    if (!seeded.current) {
      seeded.current = true
      for (let i = 0; i < N; i++) spawn(i, i < nOver ? G[2] + Math.random() * 3 : G[0] - 1 + Math.random() * 13.5)
    }
    for (let i = 0; i < N; i++) {
      const o = i * 3
      let x = st.pos[o], y = st.pos[o + 1]
      let k = st.kind[i] as Kind
      // gate transitions
      if (k === 0 && x > G[1] + 0.15 && st.fate[i] < pLeak) { k = 1; st.vy[i] = 0.4 }
      if ((k === 0 || k === 2) && x > G[2] + 0.1) {
        const paid = (st.fate[i] * 7.31) % 1 < pPaid
        if (k === 0 || x > G[2] + 0.6) k = paid ? 4 : 3
      }
      if (k === 1) { st.vy[i] -= 5.5 * dt; st.vx[i] *= 1 - dt * 1.8 }
      else if (k === 2) { st.vy[i] += (0 - y) * dt * 3 - st.vy[i] * dt * 2 }
      else if (k === 3) { st.vx[i] = Math.max(0.18, st.vx[i] * (1 - dt * 1.6)) }
      x += st.vx[i] * dt; y += st.vy[i] * dt
      st.pos[o] = x; st.pos[o + 1] = y; st.kind[i] = k
      const dead = x > G[3] + 1.2 || y < -2.2 || (k === 3 && x > G[3] - 0.3)
      if (dead) { spawn(i); continue }
      // colour (additive blending: dimmer = more transparent)
      const c = k === 1 ? C.red : k === 2 ? C.violet : k === 3 ? C.amber : k === 4 ? C.green : C.blue
      let fade = 1
      if (x < G[0]) fade = Math.max(0, 1 - (G[0] - x) / 1)
      if (k === 3) fade = Math.max(0, Math.min(1, (G[3] - 0.3 - x) / 1.6))
      if (k === 1) fade = Math.max(0, Math.min(1, (y + 2.2) / 1.2))
      st.col[o] = c.r * fade; st.col[o + 1] = c.g * fade; st.col[o + 2] = c.b * fade
    }
    geo.attributes.position.needsUpdate = true
    geo.attributes.color.needsUpdate = true
  })
  return (
    <points geometry={geo}>
      <pointsMaterial size={0.2} map={glowTexture()} vertexColors transparent depthWrite={false} blending={THREE.AdditiveBlending} sizeAttenuation />
    </points>
  )
}

function Label({ text, y, x, h, color, bg }: { text: string; x: number; y: number; h: number; color?: string; bg?: string | null }) {
  const { tex, aspect } = useMemo(() => textTexture(text, { color, bg }), [text, color, bg])
  return <sprite position={[x, y, 0]} scale={[h * aspect, h, 1]}><spriteMaterial map={tex} transparent depthWrite={false} /></sprite>
}

function Tunnel({ f }: { f: FlowFigures }) {
  useFitWidth(15.5, 5, 4.4)
  const group = useRef<THREE.Group>(null)
  const rings = useRef<THREE.Mesh[]>([])
  useFrame(({ pointer, clock }, dt) => {
    if (group.current) {
      group.current.rotation.y += (pointer.x * 0.18 - group.current.rotation.y) * Math.min(1, dt * 2.5)
      group.current.rotation.x += (0.12 - pointer.y * 0.08 - group.current.rotation.x) * Math.min(1, dt * 2.5)
    }
    rings.current.forEach((m, i) => m && (m.rotation.x = clock.elapsedTime * (0.6 + i * 0.15)))
  })
  const stages = [
    { name: 'Contract', amt: f.expected, color: '#9fb4ff' },
    { name: 'Expected', amt: f.expected, color: '#4c8dff' },
    { name: 'Invoiced', amt: f.invoiced, color: '#7aa8ff' },
    { name: 'Paid', amt: f.collected, color: '#22c55e' },
  ]
  return (
    <group ref={group}>
      <mesh rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[R + 0.08, R + 0.08, 13.6, 48, 1, true]} />
        <meshBasicMaterial color="#2f6bff" transparent opacity={0.06} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      <mesh rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[R + 0.09, R + 0.09, 13.6, 32, 10, true]} />
        <meshBasicMaterial color="#4c8dff" wireframe transparent opacity={0.08} depthWrite={false} />
      </mesh>
      {stages.map((s, i) => (
        <group key={s.name} position={[G[i], 0, 0]}>
          <mesh rotation={[0, Math.PI / 2, 0]}><torusGeometry args={[R + 0.18, 0.025, 10, 80]} /><meshBasicMaterial color={s.color} toneMapped={false} /></mesh>
          <mesh ref={(m) => { if (m) rings.current[i] = m }} rotation={[0, Math.PI / 2, 0]}><torusGeometry args={[R + 0.34, 0.008, 6, 80, Math.PI * 1.3]} /><meshBasicMaterial color={s.color} transparent opacity={0.6} /></mesh>
          <Label text={s.name} x={0} y={1.3} h={0.36} bg={null} color="#e6ecff" />
          <Label text={inrCompact(s.amt)} x={0} y={-1.08} h={0.34} color={s.color} />
        </group>
      ))}
      {f.underbilled > 0 && <Label text={`Under-billed ${inrCompact(f.underbilled)}`} x={0} y={-1.85} h={0.3} color="#ff8796" />}
      {f.overbilled > 0 && <Label text={`Over-billed ${inrCompact(f.overbilled)}`} x={G[2]} y={1.85} h={0.28} color="#c4b5fd" />}
      <Particles f={f} />
    </group>
  )
}

/** Money flow tunnel: contract → expected → invoiced → paid. Matched money flows blue; under-billing drips out red
 *  after the Expected gate, over-billing enters violet at the Invoiced gate, unpaid invoices stall amber, cash collected
 *  continues green. Every amount shown comes from the audit run; particle rates are proportional with a visibility floor. */
export default function MoneyFlow3D({ figures, className }: { figures: FlowFigures; className?: string }) {
  return (
    <Canvas className={className} dpr={[1, 1.75]} camera={{ position: [0, 0.4, 8.2], fov: 46 }} gl={{ alpha: true, antialias: true }}>
      <Tunnel f={figures} />
    </Canvas>
  )
}
