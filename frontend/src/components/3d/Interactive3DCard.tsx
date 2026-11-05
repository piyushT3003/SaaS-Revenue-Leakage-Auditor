import React, { useRef, useState, useCallback } from 'react';

interface Interactive3DCardProps {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
  glowColor?: 'cyan' | 'rose' | 'amber' | 'blue' | 'emerald';
  maxTilt?: number; // degrees, default 4
  depth?: number; // px, default 8
}

export const Interactive3DCard: React.FC<Interactive3DCardProps> = ({
  children,
  className = '',
  onClick,
  glowColor = 'cyan',
  maxTilt = 4,
  depth = 8,
}) => {
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [rotateX, setRotateX] = useState(0);
  const [rotateY, setRotateY] = useState(0);
  const [spotlightPos, setSpotlightPos] = useState({ x: 50, y: 50, opacity: 0 });
  const [isHovered, setIsHovered] = useState(false);

  const glowColorMap = {
    cyan: 'rgba(6, 182, 212, 0.16)',
    rose: 'rgba(225, 29, 72, 0.18)',
    amber: 'rgba(245, 158, 11, 0.16)',
    blue: 'rgba(59, 130, 246, 0.16)',
    emerald: 'rgba(16, 185, 129, 0.16)',
  };

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!cardRef.current) return;
      const rect = cardRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      const centerX = rect.width / 2;
      const centerY = rect.height / 2;

      // Calculate tilt angles bounded to maxTilt
      const rX = -((y - centerY) / centerY) * maxTilt;
      const rY = ((x - centerX) / centerX) * maxTilt;

      setRotateX(rX);
      setRotateY(rY);
      setSpotlightPos({
        x: (x / rect.width) * 100,
        y: (y / rect.height) * 100,
        opacity: 1,
      });
    },
    [maxTilt]
  );

  const handleMouseEnter = () => {
    setIsHovered(true);
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
    setRotateX(0);
    setRotateY(0);
    setSpotlightPos((prev) => ({ ...prev, opacity: 0 }));
  };

  const reducedMotion =
    typeof window !== 'undefined' &&
    ((typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) ||
      (typeof localStorage !== 'undefined' && localStorage.getItem('saas_reduced_motion') === 'true'));

  const transformStyle = reducedMotion
    ? undefined
    : {
        transform: isHovered
          ? `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) translateY(-4px) translateZ(${depth}px)`
          : 'perspective(1000px) rotateX(0deg) rotateY(0deg) translateY(0px) translateZ(0px)',
        transition: isHovered
          ? 'transform 0.1s cubic-bezier(0.2, 0, 0, 1)'
          : 'transform 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
      };

  return (
    <div
      ref={cardRef}
      onClick={onClick}
      onMouseMove={handleMouseMove}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      style={transformStyle}
      className={`relative overflow-hidden transition-all duration-300 will-change-transform ${
        onClick ? 'cursor-pointer' : ''
      } ${className}`}
    >
      {/* Specular light sheen gradient following pointer */}
      <div
        className="pointer-events-none absolute -inset-px rounded-inherit transition-opacity duration-300 z-10"
        style={{
          opacity: spotlightPos.opacity,
          background: `radial-gradient(400px circle at ${spotlightPos.x}% ${spotlightPos.y}%, ${glowColorMap[glowColor]}, transparent 70%)`,
        }}
        aria-hidden="true"
      />
      {children}
    </div>
  );
};
