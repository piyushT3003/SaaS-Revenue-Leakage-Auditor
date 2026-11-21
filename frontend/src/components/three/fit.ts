import { useThree } from '@react-three/fiber'
import { useLayoutEffect } from 'react'
import type { PerspectiveCamera } from 'three'

/** Moves the camera so `width` world units span the canvas, with `minZ` as the closest it may come.
 *  Keeps wide, short canvases (tunnels, galaxies) filling their panel at any aspect ratio. */
export function useFitWidth(width: number, minZ: number, height = 0) {
  const { camera, size } = useThree()
  useLayoutEffect(() => {
    const cam = camera as PerspectiveCamera
    const t = Math.tan((cam.fov * Math.PI) / 360)
    const aspect = size.width / Math.max(1, size.height)
    cam.position.z = Math.max(minZ, width / 2 / t / aspect, height / 2 / t)
    cam.updateProjectionMatrix()
  }, [camera, size.width, size.height, width, minZ, height])
}
