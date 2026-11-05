import React, { useEffect, useRef } from 'react';

interface Particle {
  x: number;
  y: number;
  z: number;
  size: number;
  baseAlpha: number;
  alpha: number;
  color: string;
  speedX: number;
  speedY: number;
  pulseSpeed: number;
  pulsePhase: number;
}

export const CinematicBackground: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    // Check reduced motion preference
    const prefersReducedMotion =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let animationFrameId: number;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    // Parallax tracking with smooth lerp
    let targetMouseX = 0;
    let targetMouseY = 0;
    let currentMouseX = 0;
    let currentMouseY = 0;
    let targetScrollY = 0;
    let currentScrollY = 0;

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };

    const handleMouseMove = (e: MouseEvent) => {
      // Normalize from -1 to 1
      targetMouseX = (e.clientX / width - 0.5) * 2;
      targetMouseY = (e.clientY / height - 0.5) * 2;
    };

    const handleScroll = () => {
      targetScrollY = window.scrollY || 0;
    };

    window.addEventListener('resize', handleResize, { passive: true });
    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    window.addEventListener('scroll', handleScroll, { passive: true });

    // Initialize multi-layer particles (Starfield + Atmospheric Nebular Dust)
    const particleCount = Math.min(120, Math.floor((width * height) / 12000));
    const particles: Particle[] = [];

    const colors = [
      'rgba(6, 182, 212, ',   // Cyan (theme primary)
      'rgba(59, 130, 246, ',  // Blue (theme secondary)
      'rgba(225, 29, 72, ',   // Rose / Crimson (theme accent)
      'rgba(241, 245, 249, ', // White / Slate (starfield)
    ];

    for (let i = 0; i < particleCount; i++) {
      // Z depth between 0.2 (distant) and 1.8 (near)
      const z = 0.2 + Math.random() * 1.6;
      const colorPrefix = colors[Math.floor(Math.random() * colors.length)];
      const baseAlpha = (0.15 + Math.random() * 0.45) * (z > 1.2 ? 0.8 : 0.4);

      particles.push({
        x: Math.random() * width,
        y: Math.random() * height,
        z,
        size: (0.8 + Math.random() * 1.8) * z,
        baseAlpha,
        alpha: baseAlpha,
        color: colorPrefix,
        speedX: (Math.random() - 0.5) * 0.15 * z,
        speedY: (Math.random() - 0.5) * 0.12 * z - 0.05 * z, // gentle upward drift
        pulseSpeed: 0.008 + Math.random() * 0.015,
        pulsePhase: Math.random() * Math.PI * 2,
      });
    }

    let lastTime = performance.now();

    const render = (time: number) => {
      const dt = Math.min(time - lastTime, 64);
      lastTime = time;

      // Smooth lerp mouse parallax & scroll parallax
      currentMouseX += (targetMouseX - currentMouseX) * 0.05;
      currentMouseY += (targetMouseY - currentMouseY) * 0.05;
      currentScrollY += (targetScrollY - currentScrollY) * 0.08;

      ctx.clearRect(0, 0, width, height);

      // Render subtle atmospheric ambient nebular glow
      const parallaxX = currentMouseX * 35;
      const parallaxY = currentMouseY * 25 - (currentScrollY * 0.03);

      // Cyan nebula corner (top-right)
      const grad1 = ctx.createRadialGradient(
        width * 0.75 + parallaxX * 0.5,
        -height * 0.05 + parallaxY * 0.5,
        10,
        width * 0.75 + parallaxX * 0.5,
        -height * 0.05 + parallaxY * 0.5,
        width * 0.65
      );
      grad1.addColorStop(0, 'rgba(6, 182, 212, 0.08)');
      grad1.addColorStop(0.5, 'rgba(6, 182, 212, 0.02)');
      grad1.addColorStop(1, 'transparent');
      ctx.fillStyle = grad1;
      ctx.fillRect(0, 0, width, height);

      // Rose nebula corner (bottom-left)
      const grad2 = ctx.createRadialGradient(
        width * 0.15 - parallaxX * 0.4,
        height * 0.95 - parallaxY * 0.4,
        10,
        width * 0.15 - parallaxX * 0.4,
        height * 0.95 - parallaxY * 0.4,
        width * 0.55
      );
      grad2.addColorStop(0, 'rgba(225, 29, 72, 0.06)');
      grad2.addColorStop(0.6, 'rgba(225, 29, 72, 0.015)');
      grad2.addColorStop(1, 'transparent');
      ctx.fillStyle = grad2;
      ctx.fillRect(0, 0, width, height);

      // Draw starfield and dust particles with 3D parallax depth
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];

        if (!prefersReducedMotion) {
          p.pulsePhase += p.pulseSpeed;
          p.alpha = p.baseAlpha + Math.sin(p.pulsePhase) * (p.baseAlpha * 0.35);

          p.x += p.speedX;
          p.y += p.speedY;

          // Wrap around edges seamlessly
          if (p.x < -10) p.x = width + 10;
          if (p.x > width + 10) p.x = -10;
          if (p.y < -10) p.y = height + 10;
          if (p.y > height + 10) p.y = -10;
        }

        // Parallax offset proportional to z depth (cursor tracking + vertical scroll tracking)
        const drawX = p.x + currentMouseX * p.z * 18;
        const drawY = p.y + currentMouseY * p.z * 14 - (currentScrollY * 0.08 * p.z);

        ctx.beginPath();
        ctx.arc(drawX, drawY, p.size, 0, Math.PI * 2);
        ctx.fillStyle = `${p.color}${Math.max(0, p.alpha)})`;
        ctx.fill();

        // Optional specular soft halo for near bright particles
        if (p.z > 1.3 && p.size > 1.8) {
          ctx.beginPath();
          ctx.arc(drawX, drawY, p.size * 2.5, 0, Math.PI * 2);
          ctx.fillStyle = `${p.color}${p.alpha * 0.25})`;
          ctx.fill();
        }
      }

      animationFrameId = requestAnimationFrame(render);
    };

    animationFrameId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('scroll', handleScroll);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none fixed inset-0 z-0 opacity-80"
      aria-hidden="true"
    />
  );
};
