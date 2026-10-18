"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { loadPhoto, type Photo } from "@/lib/image";

export default function Lab() {
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Draw the current photo onto the preview canvas.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !photo) return;
    canvas.width = photo.width;
    canvas.height = photo.height;
    canvas.getContext("2d")?.drawImage(photo.bitmap, 0, 0);
  }, [photo]);

  // Free the old photo's memory when it's replaced or when the page closes.
  useEffect(() => {
    return () => photo?.bitmap.close();
  }, [photo]);

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = ""; // lets you pick the same file again
    if (!file) return;

    setError(null);
    setLoading(true);
    try {
      setPhoto(await loadPhoto(file));
    } catch {
      setError("Couldn't read that image. Try a JPG, PNG or WebP.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col gap-6 px-6 py-10">
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

      {photo ? (
        <canvas
          ref={canvasRef}
          className="h-auto max-h-[70dvh] w-auto max-w-full self-start rounded-md border border-line"
        />
      ) : (
        <div className="grid aspect-video w-full place-items-center rounded-md border border-dashed border-line px-6 text-center text-sm text-muted">
          Pick a photo to start. It stays on your device.
        </div>
      )}
    </main>
  );
}