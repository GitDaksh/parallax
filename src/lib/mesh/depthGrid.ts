/**
 * Turns a depth map into a 3D grid mesh. Pure math, no Three.js, so it's easy to test.
 *
 * Coordinate system (world units = photo heights):
 * - The "glass" of the window is the z = 0 plane, centered on (0, 0).
 * - x points right, y points up, z points toward the viewer.
 * - The default eye sits at (0, 0, viewDistance).
 *
 * The nearest point in the photo sits on the glass; the farthest sits `depthScale` behind it.
 * Every vertex is pushed back along the sight line through its original pixel, so from the
 * default eye the mesh looks exactly like the photo. Parallax only appears when the eye moves.
 */
import type { DepthMap } from "@/lib/depth/types";

export type GridOptions = {
  /** Number of squares along the photo's longer edge (more = smoother, slower). */
  segments: number;
  /** How far behind the glass the farthest point sits, in photo heights. */
  depthScale: number;
  /** Distance from the default eye to the glass, in photo heights. */
  viewDistance: number;
  /**
   * Extra mesh around the photo on each side, as a fraction of its size (0.15 = 15%).
   * Edge pixels stretch into it, so moving the eye doesn't reveal empty space.
   */
  overscan?: number;
};

export type DepthGrid = {
  /** x, y, z for every vertex. */
  positions: Float32Array<ArrayBuffer>;
  /** Texture coordinates for every vertex. v = 0 is the top of the photo. */
  uvs: Float32Array<ArrayBuffer>;
  /** Three vertex indices per triangle, two triangles per grid square. */
  indices: Uint32Array<ArrayBuffer>;
  columns: number;
  rows: number;
};

/** Reads the depth map at (u, v) in 0–1 coordinates (top-left origin), blending the 4 nearest pixels. */
export function sampleDepth(map: DepthMap, u: number, v: number): number {
  const { data, width, height } = map;
  const x = Math.min(Math.max(u, 0), 1) * (width - 1);
  const y = Math.min(Math.max(v, 0), 1) * (height - 1);
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(x0 + 1, width - 1);
  const y1 = Math.min(y0 + 1, height - 1);
  const tx = x - x0;
  const ty = y - y0;

  const top = data[y0 * width + x0] * (1 - tx) + data[y0 * width + x1] * tx;
  const bottom =
    data[y1 * width + x0] * (1 - tx) + data[y1 * width + x1] * tx;
  return top * (1 - ty) + bottom * ty;
}

export function buildDepthGrid(
  map: DepthMap,
  aspect: number,
  options: GridOptions,
): DepthGrid {
  const { segments, depthScale, viewDistance, overscan = 0 } = options;

  // The grid covers u and v from -overscan to 1 + overscan.
  const span = 1 + 2 * overscan;
  const longSegments = Math.max(1, Math.round(segments * span));
  const segX =
    aspect >= 1
      ? longSegments
      : Math.max(1, Math.round(longSegments * aspect));
  const segY =
    aspect >= 1
      ? Math.max(1, Math.round(longSegments / aspect))
      : longSegments;
  const columns = segX + 1;
  const rows = segY + 1;

  const positions = new Float32Array(columns * rows * 3);
  const uvs = new Float32Array(columns * rows * 2);

  for (let row = 0; row < rows; row++) {
    const v = -overscan + (row / segY) * span;
    for (let col = 0; col < columns; col++) {
      const u = -overscan + (col / segX) * span;
      const i = row * columns + col;

      const depth = sampleDepth(map, u, v); // 1 = near, 0 = far (edges repeat outside 0–1)
      const behind = (1 - depth) * depthScale; // 0 for the nearest point
      const spread = 1 + behind / viewDistance; // keeps the point on its pixel's sight line

      positions[i * 3] = (u - 0.5) * aspect * spread;
      positions[i * 3 + 1] = (0.5 - v) * spread;
      positions[i * 3 + 2] = -behind;

      // Outside 0–1 the texture repeats its edge pixels (WebGL clamp-to-edge).
      uvs[i * 2] = u;
      uvs[i * 2 + 1] = v;
    }
  }

  const indices = new Uint32Array(segX * segY * 6);
  let k = 0;
  for (let row = 0; row < segY; row++) {
    for (let col = 0; col < segX; col++) {
      const topLeft = row * columns + col;
      const topRight = topLeft + 1;
      const bottomLeft = topLeft + columns;
      const bottomRight = bottomLeft + 1;
      // Counter-clockwise as seen from the viewer (+z), so faces point at the camera.
      indices[k++] = topLeft;
      indices[k++] = bottomLeft;
      indices[k++] = topRight;
      indices[k++] = topRight;
      indices[k++] = bottomLeft;
      indices[k++] = bottomRight;
    }
  }

  return { positions, uvs, indices, columns, rows };
}