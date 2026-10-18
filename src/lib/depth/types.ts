/** Shared types for the depth worker and the page that talks to it. */

/** Where the model runs. WebGPU uses the graphics card; WASM uses the CPU. */
export type DepthBackend = {
  device: "webgpu" | "wasm";
  dtype: "fp16" | "q8";
};

/** Relative depth for every pixel, row by row: 0 = farthest, 1 = nearest. */
export type DepthMap = {
  data: Float32Array<ArrayBuffer>;
  width: number;
  height: number;
  /** How long the model took, in milliseconds. */
  ms: number;
};

/** Page → worker */
export type DepthRequest = {
  type: "estimate";
  id: number;
  bitmap: ImageBitmap;
};

/** Worker → page */
export type DepthResponse =
  | { type: "loading"; loaded: number; total: number }
  | { type: "ready"; backend: DepthBackend }
  | { type: "result"; id: number; map: DepthMap }
  | { type: "error"; id: number; message: string };