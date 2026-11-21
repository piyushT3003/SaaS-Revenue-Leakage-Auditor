import { Canvas, useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'

/** Login hero: a dotted "revenue network" globe with animated contract-to-cash arcs travelling between nodes. */
function Globe() {
  const g = useRef<THREE.Group>(null)
  const R = 1.6
  const dots = useMemo(() => {
    const n = 2400, pos = new Float32Array(n * 3)
    const golden = Math.PI * (3 - Math.sqrt(5))
    for (let i = 0; i < n; i++) {
      const y = 1 - (i / (n - 1)) * 2, r = Math.sqrt(1 - y * y), th = golden * i
      pos.set([Math.cos(th) * r * R, y * R, Math.sin(th) * r * R], i * 3)
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    return geo
  }, [])
  const arcs = useMemo(() => {
    const rnd = () => new THREE.Vector3().setFromSphericalCoords(R, Math.acos(2 * Math.random() - 1), Math.random() * Math.PI * 2)
    return Array.from({ length: 14 }, (_, i) => {
      const a = rnd(), b = rnd()
      const mid = a.clone().add(b).multiplyScalar(0.5).normalize().multiplyScalar(R * (1.35 + a.distanceTo(b) * 0.18))
      const curve = new THREE.QuadraticBezierCurve3(a, mid, b)
      return { curve, geo: new THREE.BufferGeometry().setFromPoints(curve.getPoints(60)), color: i % 3 === 0 ? '#ef2b45' : '#4c8dff', offset: Math.random(), a, b }
    })
  }, [])
  const pulses = useRef<THREE.Mesh[]>([])
  useFrame(({ clock, pointer }, dt) => {
    if (g.current) {
      g.current.rotation.y += dt * 0.12
      g.current.rotation.x += (pointer.y * 0.25 + 0.25 - g.current.rotation.x) * Math.min(1, dt * 2)
    }
    pulses.current.forEach((m, i) => {
      if (!m) return
      const t = (clock.elapsedTime * 0.35 + arcs[i].offset) % 1
      m.position.copy(arcs[i].curve.getPoint(t))
      m.scale.setScalar(0.6 + Math.sin(t * Math.PI) * 0.8)
    })
  })
  return (
    <group ref={g}>
      <points geometry={dots}><pointsMaterial size={0.03} color="#a8c4ff" transparent opacity={0.95} depthWrite={false} blending={THREE.AdditiveBlending} /></points>
      <mesh><sphereGeometry args={[R * 0.985, 64, 64]} /><meshBasicMaterial color="#071236" transparent opacity={0.72} /></mesh>
      <mesh scale={1.22}><sphereGeometry args={[R, 48, 48]} />
        <shaderMaterial transparent side={THREE.BackSide} blending={THREE.AdditiveBlending} depthWrite={false}
          vertexShader={`varying vec3 vN; varying vec3 vV; void main(){ vN = normalize(normalMatrix*normal); vec4 mv = modelViewMatrix*vec4(position,1.0); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }`}
          fragmentShader={`varying vec3 vN; varying vec3 vV; void main(){ float f = pow(max(-dot(vN, vV), 0.0), 2.5); gl_FragColor = vec4(0.3, 0.5, 1.0, f * 0.5); }`} /></mesh>
      {arcs.map((a, i) => (
        <group key={i}>
          <primitive object={new THREE.Line(a.geo, new THREE.LineBasicMaterial({ color: a.color, transparent: true, opacity: 0.55 }))} />
          <mesh position={a.a}><sphereGeometry args={[0.025, 12, 12]} /><meshBasicMaterial color={a.color} /></mesh>
          <mesh position={a.b}><sphereGeometry args={[0.025, 12, 12]} /><meshBasicMaterial color={a.color} /></mesh>
          <mesh ref={(m) => { if (m) pulses.current[i] = m }}><sphereGeometry args={[0.035, 12, 12]} /><meshBasicMaterial color="#ffffff" /></mesh>
        </group>
      ))}
      <mesh rotation={[Math.PI / 2.2, 0, 0]}><torusGeometry args={[R * 1.45, 0.006, 8, 200]} /><meshBasicMaterial color="#ef2b45" transparent opacity={0.6} /></mesh>
      <mesh rotation={[Math.PI / 1.8, 0.4, 0]}><torusGeometry args={[R * 1.7, 0.004, 8, 200]} /><meshBasicMaterial color="#4c8dff" transparent opacity={0.45} /></mesh>
    </group>
  )
}

export default function RevenueGlobe({ className }: { className?: string }) {
  return (
    <Canvas className={className} dpr={[1, 1.75]} camera={{ position: [0, 0, 5.2], fov: 45 }} gl={{ alpha: true, antialias: true }}>
      <Globe />
    </Canvas>
  )
}
