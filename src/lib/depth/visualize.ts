import type { DepthMap } from "./types";

/** Draws a depth map in grayscale: white = near, black = far. */
export function drawDepthMap(canvas: HTMLCanvasElement, map: DepthMap) {
  const { data, width, height } = map;
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");
  if (!context) return;

  const image = context.createImageData(width, height);
  for (let i = 0; i < data.length; i++) {
    const value = Math.round(data[i] * 255);
    const p = i * 4;
    image.data[p] = value;
    image.data[p + 1] = value;
    image.data[p + 2] = value;
    image.data[p + 3] = 255;
  }
  context.putImageData(image, 0, 0);
}