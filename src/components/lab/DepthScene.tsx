"use client";

import { useEffect, useRef, type RefObject } from "react";
import {
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  DoubleSide,
  LinearFilter,
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
import { buildDepthGrid, type DepthGrid } from "@/lib/mesh/depthGrid";
import { windowFrustum, type Vec3 } from "@/lib/projection/windowFrustum";
import { eyeFromHead, pixelsPerCm } from "@/lib/projection/eyeFromHead";

/** Tuning knobs (some become sliders later in Phase 2). Distances are in photo heights. */
const SETTINGS = {
  /** Mesh detail along the photo's longer edge. */
  segments: 256,
  /** Triangles spanning a bigger depth jump than this are cut, so outlines don't stretch. */
  tearThreshold: 0.04,
  /** How far behind the glass the farthest point sits. */
  depthScale: 0.5,
  /** Default eye distance from the glass (mouse mode, and the mesh's reference view). */
  viewDistance: 2,
  /** How far the soft backdrop extends past the photo on each side (fraction of its size). */
  backdropOverscan: 0.2,
  /** Long edge of the tiny photo copy that becomes the blurred backdrop, in pixels. */
  backdropSize: 40,
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

/** A one-pixel depth map at the farthest depth: turns into a flat plane at the back of the scene. */
const FAR_PLANE: DepthMap = {
  data: new Float32Array([0]),
  width: 1,
  height: 1,
  ms: 0,
};

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

    const scene = new Scene();

    // --- Backdrop: a soft, blurred copy of the photo at the farthest depth ---
    // It shows through the gaps where the mesh is cut, and around the photo's edges
    // when you lean. (Step 2 replaces it with a smarter fill.)
    const backdropGeometry = toGeometry(
      buildDepthGrid(FAR_PLANE, aspect, {
        segments: 8,
        depthScale: SETTINGS.depthScale,
        viewDistance: SETTINGS.viewDistance,
        overscan: SETTINGS.backdropOverscan,
      }),
    );
    const backdropTexture = new CanvasTexture(
      makeTinyCopy(photo.bitmap, SETTINGS.backdropSize),
    );
    backdropTexture.flipY = false; // match our UVs: v = 0 is the top
    backdropTexture.colorSpace = SRGBColorSpace;
    backdropTexture.generateMipmaps = false;
    backdropTexture.minFilter = LinearFilter;
    backdropTexture.magFilter = LinearFilter; // smooth stretching = blur
    const backdropMaterial = new MeshBasicMaterial({
      map: backdropTexture,
      depthWrite: false, // never hides anything; the photo mesh always draws over it
    });
    const backdrop = new Mesh(backdropGeometry, backdropMaterial);
    backdrop.renderOrder = -1; // drawn first
    scene.add(backdrop);

    // --- Photo mesh: shaped by the depth map, torn at sudden depth jumps ---
    const geometry = toGeometry(
      buildDepthGrid(depth, aspect, {
        segments: SETTINGS.segments,
        depthScale: SETTINGS.depthScale,
        viewDistance: SETTINGS.viewDistance,
        tearThreshold: SETTINGS.tearThreshold,
      }),
    );

    const texture = new Texture(photo.bitmap);
    texture.flipY = false; // WebGL can't flip ImageBitmaps; our UVs already put v = 0 at the top
    texture.colorSpace = SRGBColorSpace;
    texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
    texture.needsUpdate = true;

    const material = new MeshBasicMaterial({ map: texture, side: DoubleSide });
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
      backdropGeometry.dispose();
      backdropMaterial.dispose();
      backdropTexture.dispose();
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

/** Turns our plain grid arrays into a Three.js geometry. */
function toGeometry(grid: DepthGrid): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(grid.positions, 3));
  geometry.setAttribute("uv", new BufferAttribute(grid.uvs, 2));
  geometry.setIndex(new BufferAttribute(grid.indices, 1));
  return geometry;
}

/** A tiny copy of the photo. Stretched back up by the GPU, it looks like a heavy blur. */
function makeTinyCopy(bitmap: ImageBitmap, longEdge: number): HTMLCanvasElement {
  const scale = longEdge / Math.max(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(2, Math.round(bitmap.width * scale));
  canvas.height = Math.max(2, Math.round(bitmap.height * scale));
  const context = canvas.getContext("2d");
  if (context) {
    context.imageSmoothingQuality = "high";
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  }
  return canvas;
}