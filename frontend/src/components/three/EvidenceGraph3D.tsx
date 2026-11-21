import { OrbitControls } from '@react-three/drei'
import { Canvas, useFrame } from '@react-three/fiber'
import { Bloom, EffectComposer } from '@react-three/postprocessing'
import { useMemo, useRef, useState } from 'react'
import * as THREE from 'three'

export interface G3Node { id: string; type: string; label: string; highlight: boolean; lane: number; row: number; rows: number; color: string }
export interface G3Edge { source: string; target: string; relation: string }

const labelCache = new Map<string, { tex: THREE.CanvasTexture; aspect: number }>()
function labelTexture(text: string) {
  const hit = labelCache.get(text)
  if (hit) return hit
  const c = document.createElement('canvas'), x = c.getContext('2d')!
  const font = '600 30px Inter, system-ui, sans-serif'
  x.font = font
  const w = Math.ceil(x.measureText(text).width) + 28, h = 46
  c.width = w; c.height = h
  x.font = font
  x.fillStyle = 'rgba(11,19,48,0.88)'; x.strokeStyle = 'rgba(255,255,255,0.14)'; x.lineWidth = 2
  x.beginPath(); x.roundRect(1, 1, w - 2, h - 2, 10); x.fill(); x.stroke()
  x.fillStyle = '#e6ecff'; x.textBaseline = 'middle'; x.fillText(text, 14, h / 2 + 1)
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4
  const out = { tex, aspect: w / h }
  labelCache.set(text, out)
  return out
}

function Node({ n, pos, selected, dim, onSelect }: { n: G3Node; pos: THREE.Vector3; selected: boolean; dim: boolean; onSelect: () => void }) {
  const ref = useRef<THREE.Mesh>(null)
  const [hover, setHover] = useState(false)
  useFrame(({ clock }) => {
    if (!ref.current) return
    const s = (n.highlight ? 1.35 : 1) * (selected || hover ? 1.3 : 1) * (1 + Math.sin(clock.elapsedTime * 2 + pos.x) * 0.05)
    ref.current.scale.lerp(new THREE.Vector3(s, s, s), 0.15)
  })
  return (
    <group position={pos}>
      <mesh ref={ref} onClick={(e) => { e.stopPropagation(); onSelect() }} onPointerOver={(e) => { e.stopPropagation(); setHover(true); document.body.style.cursor = 'pointer' }}
        onPointerOut={() => { setHover(false); document.body.style.cursor = '' }}>
        <sphereGeometry args={[0.16, 32, 32]} />
        <meshBasicMaterial color={n.color} transparent opacity={dim ? 0.25 : 1} />
      </mesh>
      <mesh scale={1.9}><sphereGeometry args={[0.16, 24, 24]} /><meshBasicMaterial color={n.color} transparent opacity={dim ? 0.03 : selected ? 0.22 : 0.1} depthWrite={false} /></mesh>
      <Label text={n.label.length > 26 ? `${n.label.slice(0, 25)}…` : n.label} dim={dim} />
    </group>
  )
}

function Label({ text, dim }: { text: string; dim: boolean }) {
  const { tex, aspect } = useMemo(() => labelTexture(text), [text])
  const h = 0.2
  return (
    <sprite position={[0, -0.36, 0]} scale={[h * aspect, h, 1]} renderOrder={10}>
      <spriteMaterial map={tex} transparent opacity={dim ? 0.3 : 1} depthTest={false} />
    </sprite>
  )
}

function Edge({ a, b, hot, dim }: { a: THREE.Vector3; b: THREE.Vector3; hot: boolean; dim: boolean }) {
  const line = useMemo(() => {
    const mid = a.clone().add(b).multiplyScalar(0.5).add(new THREE.Vector3(0, 0, 0.5))
    const pts = new THREE.QuadraticBezierCurve3(a, mid, b).getPoints(32)
    return new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ transparent: true }))
  }, [a, b])
  const mat = line.material as THREE.LineBasicMaterial
  mat.color.set(hot ? '#ff5a6e' : '#4a5d9a')
  mat.opacity = dim ? 0.12 : hot ? 1 : 0.55
  const pulse = useRef<THREE.Mesh>(null)
  const curve = useMemo(() => new THREE.QuadraticBezierCurve3(a, a.clone().add(b).multiplyScalar(0.5).add(new THREE.Vector3(0, 0, 0.5)), b), [a, b])
  useFrame(({ clock }) => { if (pulse.current) pulse.current.position.copy(curve.getPoint((clock.elapsedTime * 0.5 + a.y * 0.1) % 1)) })
  return (
    <>
      <primitive object={line} />
      {!dim && <mesh ref={pulse}><sphereGeometry args={[0.03, 8, 8]} /><meshBasicMaterial color={hot ? '#ffffff' : '#8fb0ff'} /></mesh>}
    </>
  )
}

export default function EvidenceGraph3D({ nodes, edges, selected, onSelect }: { nodes: G3Node[]; edges: G3Edge[]; selected: string | null; onSelect: (id: string) => void }) {
  const lanes = Math.max(1, ...nodes.map((n) => n.lane + 1))
  const pos = useMemo(() => {
    const m: Record<string, THREE.Vector3> = {}
    nodes.forEach((n) => {
      const x = (n.lane - (lanes - 1) / 2) * 2.1
      const y = ((n.rows - 1) / 2 - n.row) * 0.95
      const z = Math.sin(n.lane * 1.3) * 1.1 + Math.cos(n.row * 0.9) * 0.5
      m[n.id] = new THREE.Vector3(x, y, z)
    })
    return m
  }, [nodes, lanes])
  const linked = new Set(edges.filter((e) => e.source === selected || e.target === selected).flatMap((e) => [e.source, e.target]))
  return (
    <Canvas dpr={[1, 1.75]} camera={{ position: [0, 0.6, Math.max(9, lanes * 1.9)], fov: 50 }} gl={{ alpha: true, antialias: true }} onPointerMissed={() => undefined}>
      {edges.map((e, i) => pos[e.source] && pos[e.target] && (
        <Edge key={i} a={pos[e.source]} b={pos[e.target]} hot={!!selected && (e.source === selected || e.target === selected)} dim={!!selected && !(e.source === selected || e.target === selected)} />
      ))}
      {nodes.map((n) => <Node key={n.id} n={n} pos={pos[n.id]} selected={selected === n.id} dim={!!selected && selected !== n.id && !linked.has(n.id)} onSelect={() => onSelect(n.id)} />)}
      <OrbitControls enableDamping dampingFactor={0.08} autoRotate autoRotateSpeed={0.35} minDistance={3} maxDistance={30} />
      <EffectComposer multisampling={0}><Bloom intensity={0.9} luminanceThreshold={0.2} mipmapBlur /></EffectComposer>
    </Canvas>
  )
}
