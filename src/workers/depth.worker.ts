/**
 * Depth worker: runs Depth Anything V2 Small in the browser with Transformers.js,
 * on a background thread so the page never freezes.
 *
 * The model downloads once from the Hugging Face CDN and is then cached by the browser.
 * Photos never leave the device.
 */
import { env, pipeline } from "@huggingface/transformers";
import type {
  DepthBackend,
  DepthMap,
  DepthRequest,
  DepthResponse,
} from "@/lib/depth/types";

/** Apache-2.0. Only the Small variant has this license; Base/Large/Giant are non-commercial. */
const MODEL_ID = "onnx-community/depth-anything-v2-small";

// Only fetch models from the Hugging Face Hub, never from our own server.
env.allowLocalModels = false;

function send(message: DepthResponse, transfer: Transferable[] = []) {
  self.postMessage(message, { transfer });
}

/* ---------- Choosing where to run ---------- */

type GpuAdapterLike = { features: { has(feature: string): boolean } };
type GpuLike = { requestAdapter(): Promise<GpuAdapterLike | null> };

async function pickBackend(): Promise<DepthBackend> {
  const gpu = (self.navigator as Navigator & { gpu?: GpuLike }).gpu;
  try {
    const adapter = await gpu?.requestAdapter();
    // fp16 (~50 MB) is fast on the GPU but needs half-precision support.
    if (adapter?.features.has("shader-f16")) {
      return { device: "webgpu", dtype: "fp16" };
    }
  } catch {
    // WebGPU isn't usable here. Fall back to the CPU below.
  }
  // CPU fallback: the 8-bit model (~27 MB) is the smallest and fastest on WASM.
  return { device: "wasm", dtype: "q8" };
}

/* ---------- Loading the model (once) ---------- */

/** Adds up download progress across all model files. */
function createProgressTracker() {
  const files = new Map<string, { loaded: number; total: number }>();

  return (info: unknown) => {
    if (typeof info !== "object" || info === null) return;
    const { status, file, loaded, total } = info as {
      status?: string;
      file?: string;
      loaded?: number;
      total?: number;
    };
    if (status !== "progress" || !file) return;
    if (typeof loaded !== "number" || typeof total !== "number") return;

    files.set(file, { loaded, total });
    let sumLoaded = 0;
    let sumTotal = 0;
    for (const entry of files.values()) {
      sumLoaded += entry.loaded;
      sumTotal += entry.total;
    }
    send({ type: "loading", loaded: sumLoaded, total: sumTotal });
  };
}

function loadEstimator(backend: DepthBackend) {
  return pipeline("depth-estimation", MODEL_ID, {
    device: backend.device,
    dtype: backend.dtype,
    progress_callback: createProgressTracker(),
  });
}

type Estimator = Awaited<ReturnType<typeof loadEstimator>>;
let estimatorPromise: Promise<Estimator> | null = null;

function getEstimator(): Promise<Estimator> {
  estimatorPromise ??= (async () => {
    const backend = await pickBackend();
    try {
      const estimator = await loadEstimator(backend);
      send({ type: "ready", backend });
      return estimator;
    } catch (error) {
      if (backend.device === "wasm") throw error;
      // WebGPU failed (driver or missing feature). Retry on the CPU.
      const fallback: DepthBackend = { device: "wasm", dtype: "q8" };
      const estimator = await loadEstimator(fallback);
      send({ type: "ready", backend: fallback });
      return estimator;
    }
  })().catch((error: unknown) => {
    estimatorPromise = null; // let the next photo try again
    throw error;
  });
  return estimatorPromise;
}

/* ---------- Turning model output into a 0–1 depth map ---------- */

type RawDepthOutput = {
  predicted_depth: { dims: readonly number[]; data: unknown };
  depth: { data: ArrayLike<number>; width: number; height: number };
};

/**
 * Rescales raw model output to 0–1. Depth Anything predicts relative *inverse* depth,
 * so bigger values are closer: after this, 1 = nearest and 0 = farthest.
 */
function normalize(values: Float32Array): Float32Array<ArrayBuffer> {
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const range = max - min || 1;
  const out = new Float32Array(values.length);
  for (let i = 0; i < values.length; i++) out[i] = (values[i] - min) / range;
  return out;
}

function toDepthMap(output: RawDepthOutput, ms: number): DepthMap {
  const raw = output.predicted_depth;
  const [height, width] = raw.dims.slice(-2);
  if (raw.data instanceof Float32Array && raw.data.length === width * height) {
    return { data: normalize(raw.data), width, height, ms };
  }
  // Fallback: the 8-bit depth image the pipeline also returns (0–255).
  const image = output.depth;
  const data = new Float32Array(image.width * image.height);
  for (let i = 0; i < data.length; i++) data[i] = image.data[i] / 255;
  return { data, width: image.width, height: image.height, ms };
}

/* ---------- Handling requests ---------- */

async function handleEstimate({ id, bitmap }: DepthRequest) {
  try {
    const estimator = await getEstimator();

    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("OffscreenCanvas 2D is not available.");
    context.drawImage(bitmap, 0, 0);

    const start = performance.now();
    const output = await estimator(canvas);
    const ms = Math.round(performance.now() - start);

    const result = Array.isArray(output) ? output[0] : output;
    const map = toDepthMap(result, ms);
    send({ type: "result", id, map }, [map.data.buffer]);
  } catch (error) {
    send({
      type: "error",
      id,
      message: error instanceof Error ? error.message : String(error),
    });
  } finally {
    bitmap.close();
  }
}

// One photo at a time: requests wait their turn.
let queue: Promise<void> = Promise.resolve();

self.addEventListener("message", (event: MessageEvent<DepthRequest>) => {
  const request = event.data;
  if (request.type !== "estimate") return;
  queue = queue.then(() => handleEstimate(request));
});