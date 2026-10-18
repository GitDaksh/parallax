/**
 * Off-axis ("window") projection.
 *
 * The screen is a window in the z = 0 plane, centered on the origin and facing +z.
 * The eye sits in front of it at (x, y, z) with z > 0. For each eye position we build an
 * asymmetric frustum whose edges pass exactly through the window's edges. The window stays
 * fixed on screen while everything behind it shifts with parallax, like looking through glass.
 *
 * This is the axis-aligned case of Robert Kooima's "Generalized Perspective Projection".
 */
export type Vec3 = { x: number; y: number; z: number };

export type Frustum = {
  left: number;
  right: number;
  top: number;
  bottom: number;
  near: number;
  far: number;
};

export function windowFrustum(
  eye: Vec3,
  windowWidth: number,
  windowHeight: number,
  near: number,
  far: number,
): Frustum {
  // Similar triangles: scale the window's edges (seen from the eye) down to the near plane.
  const scale = near / eye.z;
  return {
    left: (-windowWidth / 2 - eye.x) * scale,
    right: (windowWidth / 2 - eye.x) * scale,
    bottom: (-windowHeight / 2 - eye.y) * scale,
    top: (windowHeight / 2 - eye.y) * scale,
    near,
    far,
  };
}