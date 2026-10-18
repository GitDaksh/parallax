import { useCallback, useEffect, useRef, useState } from "react";
import type { FaceLandmarker } from "@mediapipe/tasks-vision";
import {
  DEFAULT_CAMERA_HFOV_DEG,
  LEFT_IRIS_CENTER,
  RIGHT_IRIS_CENTER,
  headPositionFromEyes,
  type HeadPosition,
} from "./headPose";
import { OneEuroFilter } from "./oneEuro";

/** Keep in sync with "@mediapipe/tasks-vision" in package.json. */
const MEDIAPIPE_VERSION = "1.1.1";
const WASM_URL = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/wasm`;

/** Google's official Face Landmarker model (Apache-2.0), served from Google's CDN. */
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

export type TrackerState =
  | { status: "idle" }
  | { status: "starting" }
  | { status: "running"; delegate: "GPU" | "CPU" }
  | { status: "error"; message: string };

export type TrackerReadout = {
  /** Smoothed head position in cm, or null when no face is visible. */
  head: HeadPosition | null;
  /** Midpoint between the eyes in the camera image (0–1), for the debug dot. */
  eyes: { x: number; y: number } | null;
  /** Face detections per second. */
  fps: number;
};

const EMPTY_READOUT: TrackerReadout = { head: null, eyes: null, fps: 0 };

export function useHeadTracker() {
  const videoRef = useRef<HTMLVideoElement>(null);
  /** Latest smoothed head position. The 3D view reads this every frame. */
  const headRef = useRef<HeadPosition | null>(null);
  const stopRef = useRef<(() => void) | null>(null);
  const [state, setState] = useState<TrackerState>({ status: "idle" });
  const [readout, setReadout] = useState<TrackerReadout>(EMPTY_READOUT);

  const teardown = useCallback(() => {
    stopRef.current?.();
    stopRef.current = null;
    headRef.current = null;
  }, []);

  // Turn the camera off when the page closes.
  useEffect(() => teardown, [teardown]);

  const stop = useCallback(() => {
    teardown();
    setState({ status: "idle" });
    setReadout(EMPTY_READOUT);
  }, [teardown]);

  const start = useCallback(async () => {
    const video = videoRef.current;
    if (!video || stopRef.current) return;

    setState({ status: "starting" });

    let stopped = false;
    let stream: MediaStream | null = null;
    let landmarker: FaceLandmarker | null = null;
    let frame = 0;

    const shutdown = () => {
      stopped = true;
      cancelAnimationFrame(frame);
      stream?.getTracks().forEach((track) => track.stop());
      video.srcObject = null;
      landmarker?.close();
      landmarker = null;
    };
    stopRef.current = shutdown;

    try {
      // 1. Camera. Browsers only allow this on HTTPS or localhost.
      stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: "user",
          width: { ideal: 640 },
          height: { ideal: 480 },
          frameRate: { ideal: 30 },
        },
      });
      if (stopped) return shutdown();

      video.srcObject = stream;
      video.muted = true;
      video.playsInline = true;
      await video.play();

      // 2. Face Landmarker, downloaded only when you start tracking.
      const { FaceLandmarker, FilesetResolver } = await import(
        "@mediapipe/tasks-vision"
      );
      const vision = await FilesetResolver.forVisionTasks(WASM_URL);
      const create = (delegate: "GPU" | "CPU") =>
        FaceLandmarker.createFromOptions(vision, {
          baseOptions: { modelAssetPath: MODEL_URL, delegate },
          runningMode: "VIDEO",
          numFaces: 1,
        });

      let delegate: "GPU" | "CPU" = "GPU";
      let created: FaceLandmarker;
      try {
        created = await create("GPU");
      } catch {
        delegate = "CPU";
        created = await create("CPU");
      }
      landmarker = created;
      if (stopped) return shutdown();
      setState({ status: "running", delegate });

      // 3. Track: one detection per new camera frame.
      const filters = {
        x: new OneEuroFilter(1, 0.08),
        y: new OneEuroFilter(1, 0.08),
        z: new OneEuroFilter(0.5, 0.05), // distance is noisier, so smooth it more
      };
      let eyes: TrackerReadout["eyes"] = null;
      let lastVideoTime = -1;
      let detections = 0;
      let fps = 0;
      let fpsWindowStart = performance.now();
      let lastReadout = 0;

      const track = () => {
        if (stopped) return;
        frame = requestAnimationFrame(track);
        const now = performance.now();

        if (video.currentTime !== lastVideoTime) {
          lastVideoTime = video.currentTime;

          const result = created.detectForVideo(video, now);
          const face = result.faceLandmarks[0];
          const a = face?.[LEFT_IRIS_CENTER];
          const b = face?.[RIGHT_IRIS_CENTER];
          const raw =
            a && b
              ? headPositionFromEyes(a, b, {
                  width: video.videoWidth,
                  height: video.videoHeight,
                  hfovDeg: DEFAULT_CAMERA_HFOV_DEG,
                })
              : null;

          if (a && b && raw) {
            const t = now / 1000;
            headRef.current = {
              x: filters.x.filter(raw.x, t),
              y: filters.y.filter(raw.y, t),
              z: filters.z.filter(raw.z, t),
            };
            eyes = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
          } else {
            // No face: forget the history so tracking doesn't glide in from an old spot.
            headRef.current = null;
            eyes = null;
            filters.x.reset();
            filters.y.reset();
            filters.z.reset();
          }
          detections++;
        }

        if (now - fpsWindowStart >= 1000) {
          fps = Math.round((detections * 1000) / (now - fpsWindowStart));
          detections = 0;
          fpsWindowStart = now;
        }

        // Refresh the on-screen numbers 4 times a second, not every frame.
        if (now - lastReadout >= 250) {
          lastReadout = now;
          setReadout({ head: headRef.current, eyes, fps });
        }
      };
      frame = requestAnimationFrame(track);
    } catch (error) {
      shutdown();
      stopRef.current = null;
      setState({ status: "error", message: describeCameraError(error) });
    }
  }, []);

  return { videoRef, headRef, state, readout, start, stop };
}

function describeCameraError(error: unknown): string {
  if (error instanceof DOMException) {
    switch (error.name) {
      case "NotAllowedError":
        return "Camera permission was blocked. Allow it from the icon in the address bar, then try again.";
      case "NotFoundError":
        return "No camera was found on this device.";
      case "NotReadableError":
        return "The camera is being used by another app. Close it and try again.";
      case "SecurityError":
        return "The camera only works on a secure page (HTTPS or localhost).";
    }
  }
  if (typeof navigator !== "undefined" && !navigator.mediaDevices) {
    return "The camera only works on a secure page (HTTPS or localhost).";
  }
  return error instanceof Error ? error.message : "Couldn't start head tracking.";
}