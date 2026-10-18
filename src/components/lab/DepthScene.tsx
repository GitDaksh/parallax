"use client";

import { useEffect, useRef } from "react";
import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  SRGBColorSpace,
  Scene,
  Texture,
  WebGLRenderer,
} from "three";
import type { Photo } from "@/lib/image";
import type { DepthMap } from "@/lib/depth/types";
import { buildDepthGrid } from "@/lib/mesh/depthGrid";
import { windowFrustum, type Vec3 } from "@/lib/projection/windowFrustum";

/** Prototype tuning knobs (some become sliders in Phase 2). All distances are in photo heights. */
const SETTINGS = {
  /** Mesh detail along the photo's longer edge. */
  segments: 256,
  /** How far behind the glass the farthest point sits. */
  depthScale: 0.5,
  /** Default eye distance from the glass. */
  viewDistance: 2,
  /** How far the eye moves when the pointer is at the edge of the view. */
  parallax: 0.3,
  /** The window is 10% smaller than the photo, which hides the photo's edges while moving. */
  zoom: 1.1,
  /** Higher = the view catches up to the pointer faster. */
  followSpeed: 8,
};

const NEAR = 0.01;
const FAR = 100;

type Props = { photo: Photo; depth: DepthMap };

export default function DepthScene({ photo, depth }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const aspect = photo.width / photo.height;

    // --- Renderer ---
    const renderer = new WebGLRenderer({
      antialias: true,
      powerPreference: "high-performance",
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(new Color("#09090b"));
    const canvas = renderer.domElement;
    canvas.style.display = "block";
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    canvas.style.touchAction = "none"; // dragging on the view shouldn't scroll the page
    container.appendChild(canvas);

    // --- Mesh: the photo, shaped by its depth map ---
    const grid = buildDepthGrid(depth, aspect, SETTINGS);
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new BufferAttribute(grid.positions, 3));
    geometry.setAttribute("uv", new BufferAttribute(grid.uvs, 2));
    geometry.setIndex(new BufferAttribute(grid.indices, 1));

    const texture = new Texture(photo.bitmap);
    texture.flipY = false; // WebGL can't flip ImageBitmaps; our UVs already put v = 0 at the top
    texture.colorSpace = SRGBColorSpace;
    texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
    texture.needsUpdate = true;

    const material = new MeshBasicMaterial({ map: texture, side: DoubleSide });
    const scene = new Scene();
    scene.add(new Mesh(geometry, material));

    // --- Camera: never rotates; the off-axis frustum does all the work ---
    const camera = new PerspectiveCamera();
    const windowWidth = aspect / SETTINGS.zoom;
    const windowHeight = 1 / SETTINGS.zoom;

    const resize = () => {
      const width = container.clientWidth;
      const height = container.clientHeight;
      if (width > 0 && height > 0) renderer.setSize(width, height, false);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(container);
    resize();

    // --- Pointer: -1..1 across the view, 0 in the center ---
    const target = { x: 0, y: 0 };
    const current = { x: 0, y: 0 };

    const onPointerMove = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      target.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      target.y = ((event.clientY - rect.top) / rect.height) * 2 - 1;
    };

    const onPointerLeave = () => {
      target.x = 0;
      target.y = 0;
    };

    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerleave", onPointerLeave);

    // --- Animation loop (runs outside React) ---
    let frame = 0;
    let last = performance.now();

    const render = (now: number) => {
      frame = requestAnimationFrame(render);
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;

      // Smooth follow that feels the same at 60 Hz and 120 Hz.
      const blend = 1 - Math.exp(-SETTINGS.followSpeed * dt);
      current.x += (target.x - current.x) * blend;
      current.y += (target.y - current.y) * blend;

      // The pointer stands in for your head (Step 5 swaps in real head tracking).
      const eye: Vec3 = {
        x: current.x * SETTINGS.parallax,
        y: -current.y * SETTINGS.parallax,
        z: SETTINGS.viewDistance,
      };
      const f = windowFrustum(eye, windowWidth, windowHeight, NEAR, FAR);

      camera.position.set(eye.x, eye.y, eye.z);
      camera.projectionMatrix.makePerspective(
        f.left,
        f.right,
        f.top,
        f.bottom,
        f.near,
        f.far,
      );
      camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();

      renderer.render(scene, camera);
    };
    frame = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerleave", onPointerLeave);
      geometry.dispose();
      material.dispose();
      texture.dispose();
      renderer.dispose();
      canvas.remove();
    };
  }, [photo, depth]);

  return (
    <div
      ref={containerRef}
      role="img"
      aria-label="3D view of your photo"
      className="mx-auto overflow-hidden rounded-md border border-line"
      style={{
        aspectRatio: `${photo.width} / ${photo.height}`,
        width: `min(100%, calc(75dvh * ${photo.width / photo.height}))`,
      }}
    />
  );
}