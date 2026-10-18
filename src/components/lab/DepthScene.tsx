"use client";

import { useEffect, useRef, type RefObject } from "react";
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
import type { HeadPosition } from "@/lib/tracking/headPose";
import { buildDepthGrid } from "@/lib/mesh/depthGrid";
import { windowFrustum, type Vec3 } from "@/lib/projection/windowFrustum";
import { eyeFromHead, pixelsPerCm } from "@/lib/projection/eyeFromHead";

/** Prototype tuning knobs (some become sliders in Phase 2). Distances are in photo heights. */
const SETTINGS = {
  /** Mesh detail along the photo's longer edge. */
  segments: 256,
  /** Stretched-edge margin around the photo, so leaning doesn't reveal empty space. */
  overscan: 0.15,
  /** How far behind the glass the farthest point sits. */
  depthScale: 0.5,
  /** Default eye distance from the glass (mouse mode, and the mesh's reference view). */
  viewDistance: 2,
  /** Mouse mode: how far the eye moves when the pointer is at the edge of the view. */
  parallax: 0.3,
  /** The window is 10% smaller than the photo, which hides the photo's edges. */
  zoom: 1.1,
  /** How fast the eye catches up: gentle for the mouse, quick for your head (less lag). */
  pointerFollowSpeed: 8,
  headFollowSpeed: 25,
};

const NEAR = 0.01;
const FAR = 100;

type Props = {
  photo: Photo;
  depth: DepthMap;
  /** Live head position from the webcam tracker (cm), or null when not tracking. */
  headRef: RefObject<HeadPosition | null>;
  /** Screen diagonal in inches, used to convert screen pixels to centimetres. */
  screenInches: number;
};

export default function DepthScene({
  photo,
  depth,
  headRef,
  screenInches,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const screenInchesRef = useRef(screenInches);

  // Calibration changes apply instantly, without rebuilding the scene.
  useEffect(() => {
    screenInchesRef.current = screenInches;
  }, [screenInches]);

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

    // --- Mouse / touch fallback: -1..1 across the view, 0 in the center ---
    const pointer = { x: 0, y: 0 };

    const onPointerMove = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = ((event.clientY - rect.top) / rect.height) * 2 - 1;
    };

    const onPointerLeave = () => {
      pointer.x = 0;
      pointer.y = 0;
    };

    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerleave", onPointerLeave);

    // --- Where the eye should be this frame ---
    const eye: Vec3 = { x: 0, y: 0, z: SETTINGS.viewDistance };

    const targetEye = (): { target: Vec3; speed: number } => {
      const head = headRef.current;
      if (head) {
        const rect = canvas.getBoundingClientRect();
        if (rect.height > 0) {
          const { width: screenWidth, height: screenHeight } = window.screen;
          const pxPerCm = pixelsPerCm(
            screenWidth,
            screenHeight,
            screenInchesRef.current,
          );
          // Browser tabs + address bar sit between the screen's top edge and the page.
          const toolbarHeight = window.outerHeight - window.innerHeight;

          return {
            target: eyeFromHead(head, {
              pxPerCm,
              screenWidthPx: screenWidth,
              viewCenterPx: {
                x: window.screenX + rect.left + rect.width / 2,
                y:
                  window.screenY +
                  toolbarHeight +
                  rect.top +
                  rect.height / 2,
              },
              cmPerUnit: (rect.height / pxPerCm) * SETTINGS.zoom,
            }),
            speed: SETTINGS.headFollowSpeed,
          };
        }
      }

      return {
        target: {
          x: pointer.x * SETTINGS.parallax,
          y: -pointer.y * SETTINGS.parallax,
          z: SETTINGS.viewDistance,
        },
        speed: SETTINGS.pointerFollowSpeed,
      };
    };

    // --- Animation loop (runs outside React) ---
    let frame = 0;
    let last = performance.now();

    const render = (now: number) => {
      frame = requestAnimationFrame(render);
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;

      // Ease toward the target. This also smooths the camera's ~30 Hz updates up to your screen's refresh rate.
      const { target, speed } = targetEye();
      const blend = 1 - Math.exp(-speed * dt);
      eye.x += (target.x - eye.x) * blend;
      eye.y += (target.y - eye.y) * blend;
      eye.z += (target.z - eye.z) * blend;

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
  }, [photo, depth, headRef]);

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