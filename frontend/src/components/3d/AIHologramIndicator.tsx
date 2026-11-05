import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';

export type AIState = 'idle' | 'listening' | 'processing' | 'responding';

interface AIHologramIndicatorProps {
  state: AIState;
  size?: number; // size in px, default 70
}

export const AIHologramIndicator: React.FC<AIHologramIndicatorProps> = ({
  state,
  size = 72,
}) => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const stateRef = useRef<AIState>(state);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    // Scene & Camera
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    camera.position.z = 4.2;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(size, size);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    mount.appendChild(renderer.domElement);

    // Group to hold all 3D components
    const group = new THREE.Group();
    scene.add(group);

    // 1. Central Core Sphere (Icosahedron Wireframe with glowing points)
    const coreGeometry = new THREE.IcosahedronGeometry(0.8, 1);
    const coreMaterial = new THREE.MeshBasicMaterial({
      color: 0x06b6d4, // Cyan
      wireframe: true,
      transparent: true,
      opacity: 0.65,
    });
    const coreMesh = new THREE.Mesh(coreGeometry, coreMaterial);
    group.add(coreMesh);

    // Core Inner Glow Point Light
    const coreLight = new THREE.PointLight(0x00f0ff, 1.5, 10);
    scene.add(coreLight);

    // 2. Orbital Ring 1 (Torus)
    const ring1Geometry = new THREE.TorusGeometry(1.35, 0.022, 16, 64);
    const ring1Material = new THREE.MeshBasicMaterial({
      color: 0x38bdf8, // Sky cyan
      transparent: true,
      opacity: 0.8,
    });
    const ring1 = new THREE.Mesh(ring1Geometry, ring1Material);
    ring1.rotation.x = Math.PI / 3;
    group.add(ring1);

    // 3. Orbital Ring 2 (Counter-Tilted Torus)
    const ring2Geometry = new THREE.TorusGeometry(1.5, 0.018, 16, 64);
    const ring2Material = new THREE.MeshBasicMaterial({
      color: 0x818cf8, // Indigo / violet hint
      transparent: true,
      opacity: 0.6,
    });
    const ring2 = new THREE.Mesh(ring2Geometry, ring2Material);
    ring2.rotation.y = Math.PI / 4;
    ring2.rotation.z = Math.PI / 6;
    group.add(ring2);

    // 4. Floating Energy Sparkles around Core
    const particleCount = 28;
    const particleGeo = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    for (let i = 0; i < particleCount * 3; i += 3) {
      const u = Math.random();
      const v = Math.random();
      const theta = u * 2.0 * Math.PI;
      const phi = Math.acos(2.0 * v - 1.0);
      const r = 1.0 + Math.random() * 0.7;
      positions[i] = r * Math.sin(phi) * Math.cos(theta);
      positions[i + 1] = r * Math.sin(phi) * Math.sin(theta);
      positions[i + 2] = r * Math.cos(phi);
    }
    particleGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const particleMat = new THREE.PointsMaterial({
      size: 0.05,
      color: 0x00f0ff,
      transparent: true,
      opacity: 0.85,
    });
    const particles = new THREE.Points(particleGeo, particleMat);
    group.add(particles);

    let animationFrameId: number;
    let clock = new THREE.Clock();

    const animate = () => {
      const delta = clock.getDelta();
      const time = clock.getElapsedTime();
      const currentState = stateRef.current;

      // Behavior according to 4 signature states
      if (currentState === 'idle') {
        // IDLE: Subtle ambient motion
        group.rotation.y += 0.008;
        ring1.rotation.z += 0.012;
        ring2.rotation.x += 0.009;

        coreMaterial.color.setHex(0x06b6d4);
        coreMaterial.opacity = 0.5 + Math.sin(time * 2) * 0.15;
        coreMesh.scale.setScalar(1.0 + Math.sin(time * 1.5) * 0.04);
        ring1Material.color.setHex(0x38bdf8);
        ring2Material.color.setHex(0x818cf8);
      } else if (currentState === 'listening') {
        // LISTENING: Receptive quick pulsing & vibrant emerald/cyan response
        group.rotation.y += 0.02;
        ring1.rotation.z += 0.025;
        ring2.rotation.x += 0.02;

        coreMaterial.color.setHex(0x10b981); // Emerald
        coreMaterial.opacity = 0.75 + Math.sin(time * 6) * 0.2;
        coreMesh.scale.setScalar(1.05 + Math.sin(time * 4) * 0.08);
        ring1Material.color.setHex(0x34d399);
      } else if (currentState === 'processing') {
        // PROCESSING: Rapid counter-rotation, high orbital energy & purple/cyan flux
        group.rotation.y += 0.05;
        ring1.rotation.z -= 0.06;
        ring2.rotation.x += 0.055;

        coreMaterial.color.setHex(0xa855f7); // Purple
        coreMaterial.opacity = 0.85 + Math.sin(time * 12) * 0.15;
        coreMesh.scale.setScalar(1.12 + Math.sin(time * 8) * 0.12);
        ring1Material.color.setHex(0x06b6d4);
        ring2Material.color.setHex(0xc084fc);
      } else if (currentState === 'responding') {
        // RESPONDING: Smooth harmonic settling glow with cyan/emerald finish
        group.rotation.y += 0.014;
        ring1.rotation.z += 0.018;
        ring2.rotation.x += 0.014;

        coreMaterial.color.setHex(0x06b6d4);
        coreMaterial.opacity = 0.8 + Math.sin(time * 3) * 0.1;
        coreMesh.scale.setScalar(1.04);
        ring1Material.color.setHex(0x38bdf8);
      }

      renderer.render(scene, camera);
      animationFrameId = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      cancelAnimationFrame(animationFrameId);
      if (mount.contains(renderer.domElement)) {
        mount.removeChild(renderer.domElement);
      }
      coreGeometry.dispose();
      coreMaterial.dispose();
      ring1Geometry.dispose();
      ring1Material.dispose();
      ring2Geometry.dispose();
      ring2Material.dispose();
      particleGeo.dispose();
      particleMat.dispose();
      renderer.dispose();
    };
  }, [size]);

  return (
    <div
      ref={mountRef}
      style={{ width: size, height: size }}
      className="relative flex items-center justify-center shrink-0"
      aria-label={`AI Status: ${state}`}
    />
  );
};
