"use client";

import type { RefObject } from "react";
import type {
  TrackerReadout,
  TrackerState,
} from "@/lib/tracking/useHeadTracker";

type Props = {
  videoRef: RefObject<HTMLVideoElement | null>;
  state: TrackerState;
  readout: TrackerReadout;
  onStart: () => void;
  onStop: () => void;
};

export default function HeadTrackerPanel({
  videoRef,
  state,
  readout,
  onStart,
  onStop,
}: Props) {
  const active = state.status === "running" || state.status === "starting";

  return (
    <section className="flex flex-col gap-3 rounded-md border border-line p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-medium">Head tracking</h2>
          <p className="text-xs text-muted">
            Runs on your device. Nothing is recorded or uploaded.
          </p>
        </div>
        <button
          type="button"
          onClick={active ? onStop : onStart}
          className="rounded-md border border-line px-4 py-2 text-sm font-medium transition-colors duration-200 hover:border-muted hover:bg-white/5 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-foreground"
        >
          {state.status === "running"
            ? "Stop camera"
            : state.status === "starting"
              ? "Starting… (click to cancel)"
              : "Start head tracking"}
        </button>
      </div>

      {state.status === "error" && (
        <p role="alert" className="text-sm text-red-400">
          {state.message}
        </p>
      )}

      {/* Always in the page (hidden when off) so the camera has somewhere to play. */}
      <div className={active ? "flex flex-wrap items-start gap-4" : "hidden"}>
        <div className="relative w-48 overflow-hidden rounded-md border border-line">
          {/* Mirrored like a selfie camera, so moving right moves the dot right. */}
          <video
            ref={videoRef}
            muted
            playsInline
            className="block h-auto w-full -scale-x-100"
          />
          {readout.eyes && (
            <span
              aria-hidden="true"
              className="absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-emerald-400 ring-2 ring-black/40"
              style={{
                left: `${(1 - readout.eyes.x) * 100}%`,
                top: `${readout.eyes.y * 100}%`,
              }}
            />
          )}
        </div>

        <dl className="grid grid-cols-[auto_auto] gap-x-4 gap-y-1 font-mono text-xs">
          <dt className="text-muted">Backend</dt>
          <dd>{state.status === "running" ? state.delegate : "…"}</dd>
          <dt className="text-muted">Detections/s</dt>
          <dd>{readout.fps}</dd>
          <dt className="text-muted">Left / right</dt>
          <dd>{format(readout.head?.x)} cm</dd>
          <dt className="text-muted">Up / down</dt>
          <dd>{format(readout.head?.y)} cm</dd>
          <dt className="text-muted">Distance</dt>
          <dd>{format(readout.head?.z)} cm</dd>
        </dl>
      </div>
    </section>
  );
}

function format(value: number | undefined) {
  return value === undefined ? "—" : value.toFixed(1);
}