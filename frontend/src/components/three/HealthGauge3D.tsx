import { Canvas, useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'

/** 3D Revenue Health gauge: a glowing torus arc that fills to `value` (0–100), a faint full-circle track,
 *  an orbiting spark and a breathing core whose colour moves red → amber → green with the value. */
function Gauge({ value }: { value: number }) {
  const arc = useRef<THREE.Mesh>(null)
  const spark = useRef<THREE.Mesh>(null)
  const core = useRef<THREE.Mesh>(null)
  const group = useRef<THREE.Group>(null)
  const shown = useRef(0)
  const built = useRef(-1)
  const color = useMemo(() => new THREE.Color(value >= 97 ? '#22c55e' : value >= 90 ? '#f5a524' : '#ef2b45'), [value])
  useFrame(({ clock, pointer }, dt) => {
    shown.current += (value / 100 - shown.current) * Math.min(1, dt * 2.2)
    const frac = Math.max(0.0001, shown.current)
    if (arc.current && Math.abs(frac - built.current) > 0.002) {
      built.current = frac
      arc.current.geometry.dispose()
      arc.current.geometry = new THREE.TorusGeometry(1, 0.085, 16, 160, Math.PI * 2 * frac)
    }
    if (spark.current) {
      const a = Math.PI * 2 * frac
      spark.current.position.set(Math.cos(a), Math.sin(a), 0)
      spark.current.scale.setScalar(1 + Math.sin(clock.elapsedTime * 6) * 0.25)
    }
    if (core.current) core.current.scale.setScalar(0.42 + Math.sin(clock.elapsedTime * 2) * 0.03)
    if (group.current) {
      group.current.rotation.x += (-0.35 + pointer.y * 0.25 - group.current.rotation.x) * Math.min(1, dt * 3)
      group.current.rotation.y += (pointer.x * 0.4 - group.current.rotation.y) * Math.min(1, dt * 3)
    }
  })
  return (
    <group ref={group}>
      <group rotation={[0, 0, Math.PI / 2]} scale={[-1, 1, 1]}>
        <mesh><torusGeometry args={[1, 0.05, 12, 160]} /><meshBasicMaterial color="#1e2c5a" transparent opacity={0.7} /></mesh>
        <mesh ref={arc}><torusGeometry args={[1, 0.085, 16, 160, 0.001]} /><meshBasicMaterial color={color} toneMapped={false} /></mesh>
        <mesh ref={spark}><sphereGeometry args={[0.11, 16, 16]} /><meshBasicMaterial color="#ffffff" /></mesh>
      </group>
      <mesh ref={core}>
        <sphereGeometry args={[1, 48, 48]} />
        <meshBasicMaterial color={color} transparent opacity={0.22} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>
      <mesh rotation={[Math.PI / 2.3, 0, 0]}><torusGeometry args={[1.35, 0.008, 8, 120]} /><meshBasicMaterial color="#4c8dff" transparent opacity={0.55} /></mesh>
    </group>
  )
}

export default function HealthGauge3D({ value, className }: { value: number; className?: string }) {
  return (
    <Canvas className={className} dpr={[1, 1.75]} camera={{ position: [0, 0, 3.6], fov: 45 }} gl={{ alpha: true, antialias: true }}>
      <Gauge value={value} />
    </Canvas>
  )
}
