import { Canvas, useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'

export interface DonutSlice { key: string; label: string; count: number; color: string }

const R_OUT = 1.45, R_IN = 0.92, GAP = 0.035

function sector(a0: number, a1: number) {
  const s = new THREE.Shape()
  s.absarc(0, 0, R_OUT, a0, a1, false)
  s.absarc(0, 0, R_IN, a1, a0, true)
  s.closePath()
  return s
}

function Slice({ s, a0, a1, hovered, onHover, onSelect }: { s: DonutSlice; a0: number; a1: number; hovered: boolean; onHover: (k: string | null) => void; onSelect: (k: string) => void }) {
  const ref = useRef<THREE.Mesh>(null)
  const mid = (a0 + a1) / 2
  const geo = useMemo(() => new THREE.ExtrudeGeometry(sector(a0 + GAP / 2, a1 - GAP / 2), { depth: 0.34, bevelEnabled: true, bevelSize: 0.025, bevelThickness: 0.03, bevelSegments: 3, curveSegments: 48 }), [a0, a1])
  const target = useMemo(() => new THREE.Vector3(), [])
  useFrame((_, dt) => {
    if (!ref.current) return
    const lift = hovered ? 1 : 0
    target.set(Math.cos(mid) * 0.13 * lift, Math.sin(mid) * 0.13 * lift, lift * 0.22)
    ref.current.position.lerp(target, Math.min(1, dt * 9))
  })
  return (
    <mesh ref={ref} geometry={geo}
      onPointerOver={(e) => { e.stopPropagation(); onHover(s.key); document.body.style.cursor = s.key === 'OTHERS' ? '' : 'pointer' }}
      onPointerOut={() => { onHover(null); document.body.style.cursor = '' }}
      onClick={(e) => { e.stopPropagation(); onSelect(s.key) }}>
      <meshStandardMaterial color={s.color} emissive={s.color} emissiveIntensity={hovered ? 0.55 : 0.22} roughness={0.35} metalness={0.25} />
    </mesh>
  )
}

function Ring({ slices, hovered, onHover, onSelect }: { slices: DonutSlice[]; hovered: string | null; onHover: (k: string | null) => void; onSelect: (k: string) => void }) {
  const group = useRef<THREE.Group>(null)
  const total = slices.reduce((a, s) => a + s.count, 0) || 1
  let acc = Math.PI / 2
  const arcs = slices.map((s) => { const a1 = acc, a0 = acc - (s.count / total) * Math.PI * 2; acc = a0; return { s, a0, a1 } })
  useFrame(({ pointer }, dt) => {
    if (!group.current) return
    group.current.rotation.x += (-0.55 + pointer.y * 0.15 - group.current.rotation.x) * Math.min(1, dt * 3)
    group.current.rotation.y += (pointer.x * 0.25 - group.current.rotation.y) * Math.min(1, dt * 3)
  })
  return (
    <group ref={group}>
      <group position={[0, 0, -0.17]}>
        {arcs.map(({ s, a0, a1 }) => <Slice key={s.key} s={s} a0={a0} a1={a1} hovered={hovered === s.key} onHover={onHover} onSelect={onSelect} />)}
      </group>
      <mesh position={[0, 0, -0.32]}><ringGeometry args={[R_IN - 0.06, R_OUT + 0.12, 96]} /><meshBasicMaterial color="#4c8dff" transparent opacity={0.06} depthWrite={false} /></mesh>
    </group>
  )
}

/** Extruded 3D donut. The centre label is HTML in the parent, so it stays crisp and accessible. */
export default function Donut3D({ slices, hovered, onHover, onSelect, className }: { slices: DonutSlice[]; hovered: string | null; onHover: (k: string | null) => void; onSelect: (k: string) => void; className?: string }) {
  return (
    <Canvas className={className} dpr={[1, 1.75]} camera={{ position: [0, 0, 4.6], fov: 42 }} gl={{ alpha: true, antialias: true }}>
      <ambientLight intensity={0.55} />
      <directionalLight position={[2, 3, 4]} intensity={1.4} />
      <pointLight position={[-3, -2, 2]} intensity={6} color="#4c8dff" />
      <Ring slices={slices} hovered={hovered} onHover={onHover} onSelect={onSelect} />
    </Canvas>
  )
}
