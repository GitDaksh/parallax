"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { loadPhoto, type Photo } from "@/lib/image";
import {
  useDepthEstimator,
  type DepthState,
} from "@/lib/depth/useDepthEstimator";
import type { DepthBackend } from "@/lib/depth/types";
import { drawDepthMap } from "@/lib/depth/visualize";

export default function Lab() {
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const photoCanvasRef = useRef<HTMLCanvasElement>(null);
  const depthCanvasRef = useRef<HTMLCanvasElement>(null);
  const { state: depthState, backend, estimate } = useDepthEstimator();

  // Draw the photo.
  useEffect(() => {
    const canvas = photoCanvasRef.current;
    if (!canvas || !photo) return;
    canvas.width = photo.width;
    canvas.height = photo.height;
    canvas.getContext("2d")?.drawImage(photo.bitmap, 0, 0);
  }, [photo]);

  // Free the old photo's memory when it's replaced or when the page closes.
  useEffect(() => {
    return () => photo?.bitmap.close();
  }, [photo]);

  // Draw the depth map when it arrives.
  useEffect(() => {
    const canvas = depthCanvasRef.current;
    if (canvas && depthState.status === "done") {
      drawDepthMap(canvas, depthState.map);
    }
  }, [depthState]);

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = ""; // lets you pick the same file again
    if (!file) return;

    setError(null);
    setLoading(true);
    try {
      const next = await loadPhoto(file);
      setPhoto(next);
      estimate(next.bitmap);
    } catch {
      setError("Couldn't read that image. Try a JPG, PNG or WebP.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-6xl flex-col gap-6 px-6 py-10">
      <header>
        <p className="font-mono text-xs uppercase tracking-widest text-muted">
          Lab · prototype
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          Photo → depth → 3D
        </h1>
      </header>

      <div className="flex flex-wrap items-center gap-4">
        <label className="cursor-pointer rounded-md border border-line px-4 py-2 text-sm font-medium transition-colors duration-200 focus-within:outline-2 focus-within:outline-offset-4 focus-within:outline-foreground hover:border-muted hover:bg-white/5">
          {loading
            ? "Loading…"
            : photo
              ? "Choose another photo"
              : "Choose a photo"}
          <input
            type="file"
            accept="image/*"
            className="sr-only"
            disabled={loading}
            onChange={handleFile}
          />
        </label>

        {photo && (
          <span className="font-mono text-xs text-muted">
            {photo.width} × {photo.height}px
          </span>
        )}
      </div>

      {error && (
        <p role="alert" className="text-sm text-red-400">
          {error}
        </p>
      )}

      <DepthStatus state={depthState} backend={backend} />

      {photo ? (
        <div className="grid gap-4 md:grid-cols-2">
          <figure className="flex flex-col gap-2">
            <canvas
              ref={photoCanvasRef}
              className="h-auto w-full rounded-md border border-line"
            />
            <figcaption className="font-mono text-xs text-muted">
              Photo
            </figcaption>
          </figure>

          <figure className="flex flex-col gap-2">
            {depthState.status === "done" ? (
              <canvas
                ref={depthCanvasRef}
                className="h-auto w-full rounded-md border border-line"
              />
            ) : (
              <div
                className="grid w-full place-items-center rounded-md border border-dashed border-line px-6 text-center text-sm text-muted"
                style={{ aspectRatio: `${photo.width} / ${photo.height}` }}
              >
                The depth map appears here
              </div>
            )}
            <figcaption className="font-mono text-xs text-muted">
              Depth · white = near, black = far
            </figcaption>
          </figure>
        </div>
      ) : (
        <div className="grid aspect-video w-full place-items-center rounded-md border border-dashed border-line px-6 text-center text-sm text-muted">
          Pick a photo to start. It stays on your device.
        </div>
      )}
    </main>
  );
}

function DepthStatus({
  state,
  backend,
}: {
  state: DepthState;
  backend: DepthBackend | null;
}) {
  switch (state.status) {
    case "idle":
      return null;

    case "loading-model": {
      const percent =
        state.total > 0 ? Math.min(100, (state.loaded / state.total) * 100) : 0;
      return (
        <div className="flex w-full max-w-sm flex-col gap-2">
          <p className="text-sm text-muted">
            Downloading the depth AI (first time only)… {toMB(state.loaded)} /{" "}
            {toMB(state.total)} MB
          </p>
          <div
            role="progressbar"
            aria-label="Depth AI download"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(percent)}
            className="h-1 w-full overflow-hidden rounded-sm bg-line"
          >
            <div
              className="h-full bg-foreground transition-[width] duration-200 ease-out"
              style={{ width: `${percent}%` }}
            />
          </div>
        </div>
      );
    }

    case "estimating":
      return <p className="text-sm text-muted">Estimating depth…</p>;

    case "done":
      return (
        <p className="font-mono text-xs text-muted">
          Depth in {state.map.ms} ms
          {backend &&
            ` · ${backend.device === "webgpu" ? "WebGPU" : "WASM (CPU)"} · ${backend.dtype}`}
        </p>
      );

    case "error":
      return (
        <p role="alert" className="text-sm text-red-400">
          Depth failed: {state.message}
        </p>
      );
  }
}

function toMB(bytes: number) {
  return (bytes / 1_000_000).toFixed(1);
}