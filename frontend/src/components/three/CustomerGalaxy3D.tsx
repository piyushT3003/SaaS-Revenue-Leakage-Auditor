import { Canvas, useFrame, type ThreeEvent } from '@react-three/fiber'
import { useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFitWidth } from './fit'
import { glowTexture, textTexture } from './labels'

export interface GalaxyStar { id: number; name: string; mrr: number; margin: number | null; profitability: string; segment: string }

export const PROFIT_COLOR: Record<string, string> = { PROFITABLE: '#22c55e', AT_RISK: '#f5a524', UNPROFITABLE: '#ef2b45', NO_REVENUE: '#64748b' }
/** Margin → orbit radius: healthy margins sit close to the core, thin or negative ones drift to the rim. */
export const radiusFor = (m: number | null) => (m === null ? 7.4 : 1.3 + ((70 - Math.max(-50, Math.min(70, m))) / 120) * 6)
const GOLDEN = Math.PI * (3 - Math.sqrt(5))

function Stars({ stars, hovered, onHover, onPick }: { stars: GalaxyStar[]; hovered: number | null; onHover: (s: GalaxyStar | null, x: number, y: number) => void; onPick: (id: number) => void }) {
  const core = useRef<THREE.InstancedMesh>(null)
  const halo = useRef<THREE.InstancedMesh>(null)
  const spin = useRef<THREE.Group>(null)
  const tilt = useRef<THREE.Group>(null)
  useFitWidth(16.5, 9, 8)
  const tmp = useMemo(() => new THREE.Object3D(), [])
  const maxMrr = Math.max(1, ...stars.map((s) => s.mrr))
  const layout = useMemo(() => stars.map((s, i) => {
    const r = radiusFor(s.margin) + (Math.random() - 0.5) * 0.25
    const a = i * GOLDEN + r * 0.35
    return { pos: new THREE.Vector3(Math.cos(a) * r, (Math.random() - 0.5) * 0.35, Math.sin(a) * r), size: 0.06 + Math.sqrt(s.mrr / maxMrr) * 0.22, color: new THREE.Color(PROFIT_COLOR[s.profitability] ?? '#4c8dff') }
  }), [stars, maxMrr])
  useLayoutEffect(() => {
    layout.forEach((l, i) => {
      tmp.position.copy(l.pos); tmp.scale.setScalar(l.size); tmp.updateMatrix()
      core.current?.setMatrixAt(i, tmp.matrix); core.current?.setColorAt(i, l.color)
      tmp.scale.setScalar(l.size * 2.4); tmp.updateMatrix()
      halo.current?.setMatrixAt(i, tmp.matrix); halo.current?.setColorAt(i, l.color)
    })
    for (const m of [core.current, halo.current]) if (m) { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true }
  }, [layout, tmp])
  useFrame(({ pointer }, dt) => {
    if (spin.current && hovered === null) spin.current.rotation.y += dt * 0.05
    if (tilt.current) {
      tilt.current.rotation.x += (0.5 - pointer.y * 0.15 - tilt.current.rotation.x) * Math.min(1, dt * 2)
      tilt.current.rotation.z += (pointer.x * 0.08 - tilt.current.rotation.z) * Math.min(1, dt * 2)
    }
    // hovered star pulses
    if (core.current && hovered !== null) {
      const i = stars.findIndex((s) => s.id === hovered)
      if (i >= 0) { const l = layout[i]; tmp.position.copy(l.pos); tmp.scale.setScalar(l.size * 1.7); tmp.updateMatrix(); core.current.setMatrixAt(i, tmp.matrix); core.current.instanceMatrix.needsUpdate = true }
    }
  })
  const prev = useRef<number | null>(null)
  useLayoutEffect(() => {
    // restore the previously hovered star's size
    const i = stars.findIndex((s) => s.id === prev.current)
    if (i >= 0 && core.current) { const l = layout[i]; tmp.position.copy(l.pos); tmp.scale.setScalar(l.size); tmp.updateMatrix(); core.current.setMatrixAt(i, tmp.matrix); core.current.instanceMatrix.needsUpdate = true }
    prev.current = hovered
  }, [hovered, stars, layout, tmp])
  const move = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    const s = e.instanceId !== undefined ? stars[e.instanceId] : null
    onHover(s, e.nativeEvent.offsetX, e.nativeEvent.offsetY)
    document.body.style.cursor = s ? 'pointer' : ''
  }
  const rings = [{ m: 40, label: '40% margin' }, { m: 15, label: '15%' }, { m: 0, label: '0%' }, { m: -30, label: '−30%' }]
  return (
    <group ref={tilt}>
      <group ref={spin}>
        <instancedMesh ref={core} args={[undefined, undefined, stars.length]} onPointerMove={move}
          onPointerOut={() => { onHover(null, 0, 0); document.body.style.cursor = '' }}
          onClick={(e) => { e.stopPropagation(); if (e.instanceId !== undefined) onPick(stars[e.instanceId].id) }}>
          <sphereGeometry args={[1, 16, 16]} />
          <meshBasicMaterial toneMapped={false} />
        </instancedMesh>
        <instancedMesh ref={halo} args={[undefined, undefined, stars.length]} raycast={() => null}>
          <sphereGeometry args={[1, 12, 12]} />
          <meshBasicMaterial transparent opacity={0.08} depthWrite={false} blending={THREE.AdditiveBlending} />
        </instancedMesh>
      </group>
      {rings.map((r) => <Orbit key={r.m} radius={radiusFor(r.m)} label={r.label} />)}
      <mesh><sphereGeometry args={[0.32, 32, 32]} /><meshBasicMaterial color="#9cc0ff" toneMapped={false} /></mesh>
      <sprite scale={[2.6, 2.6, 1]}><spriteMaterial map={glowTexture()} color="#4c8dff" transparent depthWrite={false} blending={THREE.AdditiveBlending} /></sprite>
    </group>
  )
}

function Orbit({ radius, label }: { radius: number; label: string }) {
  const { tex, aspect } = useMemo(() => textTexture(label, { color: '#8ea3d6', bg: null, weight: 500, size: 26 }), [label])
  return (
    <group>
      <mesh rotation={[Math.PI / 2, 0, 0]}><ringGeometry args={[radius - 0.006, radius + 0.006, 160]} /><meshBasicMaterial color="#4c8dff" transparent opacity={0.28} side={THREE.DoubleSide} depthWrite={false} /></mesh>
      <sprite position={[radius + 0.1, 0.18, 0]} scale={[0.34 * aspect, 0.34, 1]}><spriteMaterial map={tex} transparent depthWrite={false} /></sprite>
    </group>
  )
}

/** 3D customer galaxy: each star is a customer — size ∝ √MRR, colour = profitability band, distance from core = margin. */
export default function CustomerGalaxy3D({ stars, hovered, onHover, onPick, className }: { stars: GalaxyStar[]; hovered: number | null; onHover: (s: GalaxyStar | null, x: number, y: number) => void; onPick: (id: number) => void; className?: string }) {
  return (
    <Canvas className={className} dpr={[1, 1.75]} camera={{ position: [0, 0, 11], fov: 45 }} gl={{ alpha: true, antialias: true }}>
      <Stars stars={stars} hovered={hovered} onHover={onHover} onPick={onPick} />
    </Canvas>
  )
}
