/**
 * Turns a tracked head position into the eye position the window projection needs.
 *
 * Real world (centimetres): the webcam sits at the top-center of the screen.
 * Head positions are measured from the webcam: x = viewer's right, y = up, z = distance.
 *
 * Scene (units): the 3D view on screen is the "glass". We measure the eye from the
 * center of that glass, and scale centimetres so the glass in the scene matches the
 * glass on your physical screen exactly. That's what makes it feel like a real window.
 */
import type { HeadPosition } from "@/lib/tracking/headPose";
import type { Vec3 } from "./windowFrustum";

export type ViewGeometry = {
  /** CSS pixels per centimetre on this screen. */
  pxPerCm: number;
  /** Screen width in CSS pixels (the webcam is at its horizontal center). */
  screenWidthPx: number;
  /** Center of the 3D view, in CSS pixels from the screen's top-left corner. */
  viewCenterPx: { x: number; y: number };
  /** How many centimetres one scene unit measures on the physical screen. */
  cmPerUnit: number;
};

/** Closest the eye may get to the glass, in cm. Guards against bad readings. */
const MIN_DISTANCE_CM = 15;

/** CSS pixels per centimetre, from the screen's diagonal size in inches. */
export function pixelsPerCm(
  screenWidthPx: number,
  screenHeightPx: number,
  diagonalInches: number,
): number {
  return Math.hypot(screenWidthPx, screenHeightPx) / (diagonalInches * 2.54);
}

export function eyeFromHead(head: HeadPosition, view: ViewGeometry): Vec3 {
  // Where the center of the 3D view is, measured from the webcam (cm).
  const centerX =
    (view.viewCenterPx.x - view.screenWidthPx / 2) / view.pxPerCm;
  const centerY = -view.viewCenterPx.y / view.pxPerCm; // below the webcam = negative

  return {
    x: (head.x - centerX) / view.cmPerUnit,
    y: (head.y - centerY) / view.cmPerUnit,
    z: Math.max(head.z, MIN_DISTANCE_CM) / view.cmPerUnit,
  };
}