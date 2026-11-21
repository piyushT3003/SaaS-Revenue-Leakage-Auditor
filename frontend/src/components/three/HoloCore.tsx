import { Canvas, useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'

export type CoreState = 'idle' | 'thinking' | 'answered' | 'refused'
const PALETTE: Record<CoreState, string> = { idle: '#4c8dff', thinking: '#22d3ee', answered: '#7c9bff', refused: '#f5a524' }

const fresnelVS = /* glsl */ `varying vec3 vN; varying vec3 vV; void main(){ vN = normalize(normalMatrix*normal); vec4 mv = modelViewMatrix*vec4(position,1.0); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }`
const fresnelFS = /* glsl */ `uniform vec3 uColor; uniform float uTime; varying vec3 vN; varying vec3 vV;
  void main(){ float f = pow(1.0 - max(dot(vN,vV),0.0), 2.0); float pulse = 0.75 + 0.25*sin(uTime*3.0);
  vec3 core = mix(uColor, vec3(1.0), 0.35*(1.0-f)); gl_FragColor = vec4(core*(0.55+f*1.8)*pulse, 0.55 + f*0.45); }`

const glowFS = /* glsl */ `uniform vec3 uColor; varying vec3 vN; varying vec3 vV; void main(){ float f = pow(max(-dot(vN, vV), 0.0), 3.0); gl_FragColor = vec4(uColor, f * 0.3); }`

function Core({ state }: { state: CoreState }) {
  const group = useRef<THREE.Group>(null)
  const shell = useRef<THREE.Mesh>(null)
  const rings = useRef<THREE.Group>(null)
  const swirl = useRef<THREE.Points>(null)
  const mat = useRef<THREE.ShaderMaterial>(null)
  const target = useMemo(() => new THREE.Color(), [])
  const uniforms = useMemo(() => ({ uColor: { value: new THREE.Color(PALETTE.idle) }, uTime: { value: 0 } }), [])
  const swirlGeo = useMemo(() => {
    const n = 900, pos = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) {
      const r = 1.35 + Math.random() * 0.55, th = Math.random() * Math.PI * 2, y = (Math.random() - 0.5) * 0.5
      pos.set([Math.cos(th) * r, y, Math.sin(th) * r], i * 3)
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    return g
  }, [])
  useFrame(({ clock, pointer }, dt) => {
    const speed = state === 'thinking' ? 3.2 : 1
    target.set(PALETTE[state])
    uniforms.uColor.value.lerp(target, Math.min(1, dt * 4))
    uniforms.uTime.value = clock.elapsedTime
    if (shell.current) { shell.current.rotation.y += dt * 0.35 * speed; shell.current.rotation.x += dt * 0.12 * speed; (shell.current.material as THREE.MeshBasicMaterial).color.copy(uniforms.uColor.value) }
    if (rings.current) rings.current.children.forEach((r, i) => { r.rotation.z += dt * (0.4 + i * 0.25) * speed * (i % 2 ? -1 : 1) })
    if (swirl.current) { swirl.current.rotation.y -= dt * 0.5 * speed; (swirl.current.material as THREE.PointsMaterial).color.copy(uniforms.uColor.value) }
    if (group.current) {
      group.current.rotation.x += (pointer.y * 0.35 - group.current.rotation.x) * Math.min(1, dt * 3)
      group.current.rotation.y += (pointer.x * 0.5 - group.current.rotation.y) * Math.min(1, dt * 3)
      group.current.position.y = Math.sin(clock.elapsedTime * 1.2) * 0.06
    }
  })
  return (
    <group ref={group}>
      {[1.15, 1.6, 2.3].map((k, i) => (
        <mesh key={i} scale={k}><sphereGeometry args={[0.62, 32, 32]} />
          <shaderMaterial vertexShader={fresnelVS} fragmentShader={glowFS} uniforms={uniforms} transparent side={THREE.BackSide} blending={THREE.AdditiveBlending} depthWrite={false} /></mesh>
      ))}
      <mesh><sphereGeometry args={[0.62, 64, 64]} /><shaderMaterial ref={mat} vertexShader={fresnelVS} fragmentShader={fresnelFS} uniforms={uniforms} transparent /></mesh>
      <mesh ref={shell}><icosahedronGeometry args={[1.0, 1]} /><meshBasicMaterial wireframe transparent opacity={0.45} color={PALETTE.idle} /></mesh>
      <group ref={rings}>
        {[[1.25, 0.6, 0], [1.42, -0.5, 0.7], [1.58, 1.2, -0.4]].map(([r, rx, ry], i) => (
          <mesh key={i} rotation={[rx, ry, 0]}>
            <torusGeometry args={[r, 0.008, 8, 160]} />
            <meshBasicMaterial color={i === 2 ? '#ef2b45' : '#9cc0ff'} transparent opacity={0.7} />
          </mesh>
        ))}
      </group>
      <points ref={swirl} geometry={swirlGeo}><pointsMaterial size={0.025} transparent opacity={0.85} color={PALETTE.idle} blending={THREE.AdditiveBlending} depthWrite={false} /></points>
      <mesh position={[0, -1.55, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.2, 1.1, 64]} /><meshBasicMaterial color="#4c8dff" transparent opacity={0.18} side={THREE.DoubleSide} />
      </mesh>
    </group>
  )
}

/** Interactive 3D holographic core (follows the pointer, spins faster while querying, turns amber at the read-only boundary). */
export default function HoloCore({ state = 'idle', className }: { state?: CoreState; className?: string }) {
  return (
    <Canvas className={className} dpr={[1, 1.75]} camera={{ position: [0, 0.2, 4.4], fov: 42 }} gl={{ alpha: true, antialias: true }}>
      <Core state={state} />
    </Canvas>
  )
}
