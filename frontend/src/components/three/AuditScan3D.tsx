import { Canvas, useFrame } from '@react-three/fiber'
import { useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFitWidth } from './fit'

const COLS = 18, ROWS = 7
const COUNT = COLS * ROWS
const BASE = new THREE.Color('#2b4fae'), HOT = new THREE.Color('#7fb2ff'), RED = new THREE.Color('#ff3b55')

/** A wireframe ledger of record blocks swept by a scanning beam. Purely indeterminate — it shows that the audit is
 *  working, never a made-up percentage. A few blocks flash red as the beam passes to suggest checks being made. */
function Ledger() {
  useFitWidth(COLS * 0.42 + 2.4, 4.6, 3.6)
  const mesh = useRef<THREE.InstancedMesh>(null)
  const beam = useRef<THREE.Group>(null)
  const group = useRef<THREE.Group>(null)
  const tmp = useMemo(() => new THREE.Object3D(), [])
  const col = useMemo(() => new THREE.Color(), [])
  const cells = useMemo(() => Array.from({ length: COUNT }, (_, i) => {
    const c = i % COLS, r = Math.floor(i / COLS)
    const h = 0.15 + Math.random() * 0.75
    return { x: (c - (COLS - 1) / 2) * 0.42, z: (r - (ROWS - 1) / 2) * 0.42, flag: Math.random() < 0.07, h }
  }), [])
  useLayoutEffect(() => {
    const m = mesh.current
    if (!m) return
    cells.forEach((c, i) => { tmp.position.set(c.x, c.h / 2 - 0.45, c.z); tmp.scale.set(0.3, c.h, 0.3); tmp.updateMatrix(); m.setMatrixAt(i, tmp.matrix); m.setColorAt(i, BASE) })
    m.instanceMatrix.needsUpdate = true
    if (m.instanceColor) m.instanceColor.needsUpdate = true
  }, [cells, tmp])
  useFrame(({ clock, pointer }, dt) => {
    const t = clock.elapsedTime
    const span = COLS * 0.42 / 2 + 0.2
    const bx = Math.sin(t * 0.9) * span
    if (beam.current) beam.current.position.x = bx
    if (group.current) {
      group.current.rotation.y += (-0.3 + pointer.x * 0.25 - group.current.rotation.y) * Math.min(1, dt * 2)
      group.current.rotation.x += (0.42 - pointer.y * 0.1 - group.current.rotation.x) * Math.min(1, dt * 2)
    }
    const m = mesh.current
    if (!m) return
    cells.forEach((c, i) => {
      const d = Math.abs(c.x - bx)
      const heat = Math.max(0, 1 - d / 0.7)
      col.copy(BASE).lerp(c.flag && heat > 0.2 ? RED : HOT, heat)
      m.setColorAt(i, col)
      const hh = c.h * (1 + heat * 0.35); tmp.position.set(c.x, hh / 2 - 0.45, c.z); tmp.scale.set(0.3, hh, 0.3); tmp.updateMatrix(); m.setMatrixAt(i, tmp.matrix)
    })
    m.instanceMatrix.needsUpdate = true
    if (m.instanceColor) m.instanceColor.needsUpdate = true
  })
  const beamTex = useMemo(() => {
    const c = document.createElement('canvas'); c.width = 64; c.height = 4
    const x = c.getContext('2d')!, g = x.createLinearGradient(0, 0, 64, 0)
    g.addColorStop(0, 'rgba(76,141,255,0)'); g.addColorStop(0.5, 'rgba(160,200,255,0.9)'); g.addColorStop(1, 'rgba(76,141,255,0)')
    x.fillStyle = g; x.fillRect(0, 0, 64, 4)
    return new THREE.CanvasTexture(c)
  }, [])
  return (
    <group ref={group} position={[0, 0.35, -0.4]}>
      <instancedMesh ref={mesh} args={[undefined, undefined, COUNT]}>
        <boxGeometry args={[1, 1, 1]} />
        <meshBasicMaterial transparent opacity={0.55} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
      </instancedMesh>
      <gridHelper args={[COLS * 0.42 + 1.2, 24, '#1a2d66', '#12204a']} position={[0, -0.45, 0]} />
      <group ref={beam}>
        <mesh rotation={[0, Math.PI / 2, 0]}><planeGeometry args={[ROWS * 0.42 + 1, 1.9]} /><meshBasicMaterial color="#4c8dff" transparent opacity={0.08} side={THREE.DoubleSide} depthWrite={false} blending={THREE.AdditiveBlending} /></mesh>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.44, 0]}><planeGeometry args={[1.4, ROWS * 0.42 + 1]} /><meshBasicMaterial map={beamTex} transparent depthWrite={false} blending={THREE.AdditiveBlending} /></mesh>
        <mesh position={[0, 0.95, 0]}><boxGeometry args={[0.02, 0.02, ROWS * 0.42 + 0.2]} /><meshBasicMaterial color="#cfe0ff" toneMapped={false} /></mesh>
      </group>
    </group>
  )
}

export default function AuditScan3D({ className }: { className?: string }) {
  return (
    <Canvas className={className} dpr={[1, 1.75]} camera={{ position: [0, 0.2, 5.2], fov: 45 }} gl={{ alpha: true, antialias: true }}>
      <Ledger />
    </Canvas>
  )
}
