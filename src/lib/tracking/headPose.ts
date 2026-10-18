/**
 * Head position from eye positions (pure math, easy to test).
 *
 * Your eyes are about 6.3 cm apart. The closer you are to the camera, the more pixels apart
 * they appear. A pinhole-camera model turns that pixel distance into your distance from the
 * camera, and the midpoint between your eyes into your left/right/up/down position.
 *
 * Output is in centimetres, relative to the camera, from the viewer's point of view:
 * x = toward the viewer's right, y = up, z = distance from the camera (always positive).
 */

export type Point2 = { x: number; y: number };
export type HeadPosition = { x: number; y: number; z: number };
export type CameraModel = { width: number; height: number; hfovDeg: number };

/** Average adult distance between the pupils. */
export const AVERAGE_IPD_CM = 6.3;

/** Typical laptop webcam horizontal field of view. We calibrate this in Phase 2. */
export const DEFAULT_CAMERA_HFOV_DEG = 60;

/** Iris centers in MediaPipe's 478-point face mesh. */
export const LEFT_IRIS_CENTER = 473;
export const RIGHT_IRIS_CENTER = 468;

/**
 * @param eyeA First eye, in normalized image coordinates (0–1).
 * @param eyeB Second eye, in normalized image coordinates (0–1).
 */
export function headPositionFromEyes(
  eyeA: Point2,
  eyeB: Point2,
  camera: CameraModel,
  ipdCm = AVERAGE_IPD_CM,
): HeadPosition | null {
  const ax = eyeA.x * camera.width;
  const ay = eyeA.y * camera.height;
  const bx = eyeB.x * camera.width;
  const by = eyeB.y * camera.height;

  const eyeDistancePx = Math.hypot(bx - ax, by - ay);
  if (!(eyeDistancePx > 1)) return null;

  // Focal length in pixels, from the camera's horizontal field of view.
  const focalPx =
    camera.width / 2 / Math.tan((camera.hfovDeg * Math.PI) / 360);
  const z = (focalPx * ipdCm) / eyeDistancePx;

  const offsetX = (ax + bx) / 2 - camera.width / 2;
  const offsetY = (ay + by) / 2 - camera.height / 2;

  // The camera sees you un-mirrored: when you move to your right, you move left in its image.
  return {
    x: (-offsetX * z) / focalPx,
    y: (-offsetY * z) / focalPx,
    z,
  };
}