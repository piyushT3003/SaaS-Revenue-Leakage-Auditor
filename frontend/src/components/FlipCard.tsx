import { motion } from 'framer-motion'
import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

/** CSS-3D flip card. Faces swap at the 90° mark by opacity (instead of backface-visibility, which Chrome
 *  flattens under backdrop-filter), so it renders correctly on glass panels. Honours reduced motion via MotionConfig. */
export function FlipCard({ flipped, front, back, className }: { flipped: boolean; front: ReactNode; back: ReactNode; className?: string }) {
  const swap = { duration: 0.01, delay: 0.2 }
  return (
    <div className={cn('relative h-full [perspective:1100px]', className)}>
      <motion.div className="relative h-full" style={{ transformStyle: 'preserve-3d' }} initial={false}
        animate={{ rotateY: flipped ? 180 : 0 }} transition={{ type: 'spring', stiffness: 160, damping: 20 }}>
        <motion.div className={cn('h-full', flipped && 'pointer-events-none')} initial={false} animate={{ opacity: flipped ? 0 : 1 }} transition={swap} inert={flipped}>{front}</motion.div>
        <motion.div className={cn('absolute inset-0', !flipped && 'pointer-events-none')} style={{ rotateY: 180 }} initial={false} animate={{ opacity: flipped ? 1 : 0 }} transition={swap} inert={!flipped}>{back}</motion.div>
      </motion.div>
    </div>
  )
}
