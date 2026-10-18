"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { loadPhoto, type Photo } from "@/lib/image";
import {
  useDepthEstimator,
  type DepthState,
} from "@/lib/depth/useDepthEstimator";
import type { DepthBackend } from "@/lib/depth/types";
import { drawDepthMap } from "@/lib/depth/visualize";
import { useHeadTracker } from "@/lib/tracking/useHeadTracker";
import DepthScene from "@/components/lab/DepthScene";
import HeadTrackerPanel from "@/components/lab/HeadTrackerPanel";
import ScreenSizeControl from "@/components/lab/ScreenSizeControl";

export default function Lab() {
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [screenInches, setScreenInches] = useState(13.3);
  const photoCanvasRef = useRef<HTMLCanvasElement>(null);
  const depthCanvasRef = useRef<HTMLCanvasElement>(null);
  const { state: depthState, backend, estimate } = useDepthEstimator();
  const tracker = useHeadTracker();

  // Draw the photo preview.
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

  // Draw the depth preview when it arrives.
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

  const ready = photo !== null && depthState.status === "done";
  const tracking = tracker.state.status === "running";

  return (
    <main className="mx-auto grid min-h-dvh w-full max-w-7xl items-start gap-6 px-6 py-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
      {/* Controls: first on phones, a sidebar on the right on large screens */}
      <aside className="flex flex-col gap-4 lg:order-2">
        <header>
          <p className="font-mono text-xs uppercase tracking-widest text-muted">
            Lab · prototype
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">
            Photo → depth → 3D
          </h1>
        </header>

        <div className="flex flex-wrap items-center gap-3">
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

        <HeadTrackerPanel
          videoRef={tracker.videoRef}
          state={tracker.state}
          readout={tracker.readout}
          onStart={() => void tracker.start()}
          onStop={tracker.stop}
        />

        <ScreenSizeControl inches={screenInches} onChange={setScreenInches} />

        {photo && (
          <div className="grid grid-cols-2 gap-3">
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
              {ready ? (
                <canvas
                  ref={depthCanvasRef}
                  className="h-auto w-full rounded-md border border-line"
                />
              ) : (
                <div
                  className="w-full rounded-md border border-dashed border-line"
                  style={{ aspectRatio: `${photo.width} / ${photo.height}` }}
                />
              )}
              <figcaption className="font-mono text-xs text-muted">
                Depth · white = near
              </figcaption>
            </figure>
          </div>
        )}
      </aside>

      {/* The 3D view: stays in sight on large screens while you scroll the controls */}
      <section className="flex min-w-0 flex-col gap-3 lg:sticky lg:top-8 lg:order-1">
        {photo ? (
          ready ? (
            <DepthScene
              photo={photo}
              depth={depthState.map}
              headRef={tracker.headRef}
              screenInches={screenInches}
            />
          ) : (
            <div
              className="mx-auto grid place-items-center rounded-md border border-dashed border-line px-6 text-center text-sm text-muted"
              style={{
                aspectRatio: `${photo.width} / ${photo.height}`,
                width: `min(100%, calc(75dvh * ${photo.width / photo.height}))`,
              }}
            >
              The 3D view appears here
            </div>
          )
        ) : (
          <div className="grid aspect-video w-full place-items-center rounded-md border border-dashed border-line px-6 text-center text-sm text-muted">
            Pick a photo to start. It stays on your device.
          </div>
        )}

        {ready && (
          <p className="text-center text-sm text-muted">
            {tracking
              ? "Move your head slowly. The screen is a window."
              : "Move your mouse over the view, or start head tracking."}
          </p>
        )}
      </section>
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
        <div className="flex w-full flex-col gap-2">
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