import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Bloom, EffectComposer, Vignette } from '@react-three/postprocessing'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'

/** Full-screen WebGL backdrop: a GPU spiral galaxy (shader points), deep starfield, a lit planet with
 *  Fresnel atmosphere and particle ring, and drifting nebula sprites — with pointer parallax and bloom.
 *  Rendered behind the UI with pointer-events disabled. Pauses when the tab is hidden. */

const pointer = { x: 0, y: 0 }

const galaxyVS = /* glsl */ `
  uniform float uTime; uniform float uSize; uniform float uPixelRatio;
  attribute float aScale; attribute vec3 aColor; attribute float aSpeed;
  varying vec3 vColor; varying float vAlpha;
  void main(){
    vec3 p = position;
    float r = length(p.xz);
    float ang = atan(p.z, p.x) + uTime * aSpeed / (0.6 + r * 0.35);
    p.x = cos(ang) * r; p.z = sin(ang) * r;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = uSize * aScale * uPixelRatio * (1.0 / -mv.z);
    vColor = aColor;
    vAlpha = 0.55 + 0.45 * sin(uTime * 1.7 + aScale * 40.0);
  }`
const galaxyFS = /* glsl */ `
  varying vec3 vColor; varying float vAlpha;
  void main(){
    float d = length(gl_PointCoord - 0.5);
    float s = pow(1.0 - smoothstep(0.0, 0.5, d), 2.4);
    gl_FragColor = vec4(vColor * s * 1.6, s * vAlpha);
  }`

function Galaxy() {
  const { gl } = useThree()
  const mat = useRef<THREE.ShaderMaterial>(null)
  const geo = useMemo(() => {
    const n = 16000, arms = 4, radius = 9
    const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), scale = new Float32Array(n), speed = new Float32Array(n)
    const inner = new THREE.Color('#ff3b5c'), mid = new THREE.Color('#7c5cff'), outer = new THREE.Color('#2f7bff')
    for (let i = 0; i < n; i++) {
      const r = Math.pow(Math.random(), 1.6) * radius
      const branch = ((i % arms) / arms) * Math.PI * 2
      const spin = r * 0.9
      const rnd = (k: number) => Math.pow(Math.random(), 3) * (Math.random() < 0.5 ? 1 : -1) * k * (0.3 + r * 0.12)
      pos[i * 3] = Math.cos(branch + spin) * r + rnd(1)
      pos[i * 3 + 1] = rnd(0.35)
      pos[i * 3 + 2] = Math.sin(branch + spin) * r + rnd(1)
      const t = r / radius
      const c = t < 0.35 ? inner.clone().lerp(mid, t / 0.35) : mid.clone().lerp(outer, (t - 0.35) / 0.65)
      col.set([c.r, c.g, c.b], i * 3)
      scale[i] = Math.random() * 0.9 + 0.15
      speed[i] = 0.05 + Math.random() * 0.04
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    g.setAttribute('aColor', new THREE.BufferAttribute(col, 3))
    g.setAttribute('aScale', new THREE.BufferAttribute(scale, 1))
    g.setAttribute('aSpeed', new THREE.BufferAttribute(speed, 1))
    return g
  }, [])
  const uniforms = useMemo(() => ({ uTime: { value: 0 }, uSize: { value: 42 }, uPixelRatio: { value: Math.min(gl.getPixelRatio(), 1.5) } }), [gl])
  useFrame((_, dt) => { if (mat.current) mat.current.uniforms.uTime.value += dt })
  return (
    <points geometry={geo} position={[-5.5, -1.2, -9]} rotation={[0.95, 0.3, 0.15]}>
      <shaderMaterial ref={mat} vertexShader={galaxyVS} fragmentShader={galaxyFS} uniforms={uniforms}
        transparent depthWrite={false} blending={THREE.AdditiveBlending} />
    </points>
  )
}

function Stars() {
  const ref = useRef<THREE.Points>(null)
  const geo = useMemo(() => {
    const n = 2600, pos = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) {
      const r = 25 + Math.random() * 45, th = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1)
      pos.set([r * Math.sin(ph) * Math.cos(th), r * Math.sin(ph) * Math.sin(th), r * Math.cos(ph)], i * 3)
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    return g
  }, [])
  useFrame((_, dt) => { if (ref.current) ref.current.rotation.y += dt * 0.006 })
  return <points ref={ref} geometry={geo}><pointsMaterial size={0.09} color="#c8d8ff" transparent opacity={0.85} sizeAttenuation depthWrite={false} /></points>
}

const atmoVS = /* glsl */ `varying vec3 vN; varying vec3 vV; void main(){ vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position,1.0); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`
const atmoFS = /* glsl */ `uniform vec3 uColor; uniform float uPower; varying vec3 vN; varying vec3 vV; void main(){ float f = pow(1.0 - max(dot(vN, vV), 0.0), uPower); gl_FragColor = vec4(uColor * f * 1.15, f * 0.75); }`
const surfaceFS = /* glsl */ `
  uniform float uTime; varying vec3 vN; varying vec3 vV; varying vec3 vP;
  float h(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,37.719))) * 43758.5453); }
  float n3(vec3 p){ vec3 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
    return mix(mix(mix(h(i),h(i+vec3(1,0,0)),f.x),mix(h(i+vec3(0,1,0)),h(i+vec3(1,1,0)),f.x),f.y),
               mix(mix(h(i+vec3(0,0,1)),h(i+vec3(1,0,1)),f.x),mix(h(i+vec3(0,1,1)),h(i+vec3(1,1,1)),f.x),f.y),f.z); }
  void main(){
    vec3 p = vP * 2.2 + vec3(uTime * 0.03, 0.0, 0.0);
    float bands = n3(vec3(p.x * 0.6, p.y * 5.0, p.z * 0.6)) * 0.6 + n3(p * 3.0) * 0.4;
    vec3 base = mix(vec3(0.05,0.07,0.22), vec3(0.32,0.12,0.42), bands);
    base = mix(base, vec3(0.85,0.18,0.32), smoothstep(0.62, 0.9, bands) * 0.55);
    vec3 L = normalize(vec3(-0.8, 0.5, 0.6));
    float diff = max(dot(vN, L), 0.0);
    float rim = pow(1.0 - max(dot(vN, vV), 0.0), 3.0);
    gl_FragColor = vec4(base * (0.12 + diff * 1.1) + vec3(0.35,0.5,1.0) * rim * 0.8, 1.0);
  }`
const surfaceVS = /* glsl */ `varying vec3 vN; varying vec3 vV; varying vec3 vP; void main(){ vP = position; vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position,1.0); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`

function Planet() {
  const g = useRef<THREE.Group>(null)
  const surf = useRef<THREE.ShaderMaterial>(null)
  const ring = useMemo(() => {
    const n = 5000, pos = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) {
      const r = 3.0 + Math.pow(Math.random(), 0.8) * 2.0, a = Math.random() * Math.PI * 2
      pos.set([Math.cos(a) * r, (Math.random() - 0.5) * 0.04, Math.sin(a) * r], i * 3)
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    return geo
  }, [])
  const su = useMemo(() => ({ uTime: { value: 0 } }), [])
  useFrame((_, dt) => {
    if (g.current) g.current.rotation.y += dt * 0.04
    if (surf.current) surf.current.uniforms.uTime.value += dt
  })
  return (
    <group position={[8.6, 4.4, -12]} rotation={[0.35, 0, -0.42]} scale={1.15}>
      <group ref={g}>
        <mesh><sphereGeometry args={[2.2, 96, 96]} /><shaderMaterial ref={surf} vertexShader={surfaceVS} fragmentShader={surfaceFS} uniforms={su} /></mesh>
        <points geometry={ring}><pointsMaterial size={0.035} color="#ff7a8f" transparent opacity={0.7} depthWrite={false} blending={THREE.AdditiveBlending} /></points>
      </group>
      <mesh scale={1.1}>
        <sphereGeometry args={[2.2, 64, 64]} />
        <shaderMaterial vertexShader={atmoVS} fragmentShader={atmoFS} uniforms={{ uColor: { value: new THREE.Color('#ff3355') }, uPower: { value: 3.4 } }}
          transparent side={THREE.BackSide} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>
    </group>
  )
}

function Nebula() {
  const tex = useMemo(() => {
    const c = document.createElement('canvas'); c.width = c.height = 128
    const x = c.getContext('2d')!
    const gr = x.createRadialGradient(64, 64, 0, 64, 64, 64)
    gr.addColorStop(0, 'rgba(255,255,255,0.9)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.25)'); gr.addColorStop(1, 'rgba(255,255,255,0)')
    x.fillStyle = gr; x.fillRect(0, 0, 128, 128)
    return new THREE.CanvasTexture(c)
  }, [])
  const clouds = useMemo(() => [
    { p: [-9, 4, -20], s: 22, c: '#c8102e', o: 0.16 }, { p: [10, -6, -22], s: 26, c: '#1e40ff', o: 0.14 },
    { p: [2, 8, -26], s: 30, c: '#6d28d9', o: 0.1 }, { p: [-3, -9, -18], s: 18, c: '#0ea5e9', o: 0.08 },
  ], [])
  const ref = useRef<THREE.Group>(null)
  useFrame(({ clock }) => { if (ref.current) ref.current.children.forEach((s, i) => { s.rotation.z = Math.sin(clock.elapsedTime * 0.03 + i) * 0.4 }) })
  return (
    <group ref={ref}>
      {clouds.map((n, i) => (
        <sprite key={i} position={n.p as [number, number, number]} scale={[n.s, n.s, 1]}>
          <spriteMaterial map={tex} color={n.c} transparent opacity={n.o} depthWrite={false} blending={THREE.AdditiveBlending} />
        </sprite>
      ))}
    </group>
  )
}

function Rig({ intensity }: { intensity: number }) {
  const { camera } = useThree()
  useFrame((_, dt) => {
    camera.position.x += (pointer.x * 1.4 * intensity - camera.position.x) * Math.min(1, dt * 1.5)
    camera.position.y += (-pointer.y * 0.9 * intensity - camera.position.y) * Math.min(1, dt * 1.5)
    camera.lookAt(0, 0, -10)
  })
  return null
}

function ShootingStars() {
  const ref = useRef<THREE.Mesh>(null)
  const state = useRef({ t: 0, next: 4, from: new THREE.Vector3(), dir: new THREE.Vector3() })
  useFrame((_, dt) => {
    const s = state.current, m = ref.current
    if (!m) return
    s.t += dt
    if (s.t > s.next) {
      s.t = 0; s.next = 6 + Math.random() * 8
      s.from.set(-14 + Math.random() * 10, 6 + Math.random() * 4, -15)
      s.dir.set(1, -0.45 - Math.random() * 0.2, 0).normalize()
    }
    const k = s.t / 1.1
    m.visible = k < 1
    if (m.visible) {
      m.position.copy(s.from).addScaledVector(s.dir, k * 22)
      m.rotation.z = Math.atan2(s.dir.y, s.dir.x)
      ;(m.material as THREE.MeshBasicMaterial).opacity = Math.sin(k * Math.PI) * 0.9
    }
  })
  return <mesh ref={ref} visible={false}><planeGeometry args={[2.6, 0.035]} /><meshBasicMaterial color="#dbe7ff" transparent opacity={0} blending={THREE.AdditiveBlending} depthWrite={false} /></mesh>
}

export default function GalaxyScene({ intensity = 1, planet = true, active = true }: { intensity?: number; planet?: boolean; active?: boolean }) {
  useEffect(() => {
    const move = (e: PointerEvent) => { pointer.x = e.clientX / window.innerWidth - 0.5; pointer.y = e.clientY / window.innerHeight - 0.5 }
    window.addEventListener('pointermove', move, { passive: true })
    return () => window.removeEventListener('pointermove', move)
  }, [])
  return (
    <Canvas className="!absolute inset-0" dpr={[1, 1.5]} camera={{ position: [0, 0, 6], fov: 55 }}
      gl={{ antialias: false, powerPreference: 'high-performance', alpha: true }} frameloop={active ? 'always' : 'never'}>
      <Stars />
      <Nebula />
      <Galaxy />
      {planet && <Planet />}
      <ShootingStars />
      <Rig intensity={intensity} />
      <EffectComposer multisampling={0}>
        <Bloom intensity={0.85} luminanceThreshold={0.15} luminanceSmoothing={0.4} mipmapBlur />
        <Vignette eskil={false} offset={0.25} darkness={0.75} />
      </EffectComposer>
    </Canvas>
  )
}
