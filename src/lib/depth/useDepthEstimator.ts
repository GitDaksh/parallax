import { useCallback, useEffect, useRef, useState } from "react";
import type {
  DepthBackend,
  DepthMap,
  DepthRequest,
  DepthResponse,
} from "./types";

export type DepthState =
  | { status: "idle" }
  | { status: "loading-model"; loaded: number; total: number }
  | { status: "estimating" }
  | { status: "done"; map: DepthMap }
  | { status: "error"; message: string };

/** Runs depth estimation in a background worker. The worker and the model load on first use. */
export function useDepthEstimator() {
  const workerRef = useRef<Worker | null>(null);
  const latestId = useRef(0);
  const [state, setState] = useState<DepthState>({ status: "idle" });
  const [backend, setBackend] = useState<DepthBackend | null>(null);

  // Stop the worker when the page closes.
  useEffect(() => {
    return () => {
      workerRef.current?.terminate();
      workerRef.current = null;
    };
  }, []);

  const estimate = useCallback((bitmap: ImageBitmap) => {
    let worker = workerRef.current;

    if (!worker) {
      worker = new Worker(
        new URL("../../workers/depth.worker.ts", import.meta.url),
      );

      worker.addEventListener(
        "message",
        (event: MessageEvent<DepthResponse>) => {
          const message = event.data;
          switch (message.type) {
            case "loading":
              setState({
                status: "loading-model",
                loaded: message.loaded,
                total: message.total,
              });
              break;
            case "ready":
              setBackend(message.backend);
              setState({ status: "estimating" });
              break;
            case "result":
              // Ignore results for photos that were replaced in the meantime.
              if (message.id === latestId.current) {
                setState({ status: "done", map: message.map });
              }
              break;
            case "error":
              if (message.id === latestId.current) {
                setState({ status: "error", message: message.message });
              }
              break;
          }
        },
      );

      worker.addEventListener("error", (event) => {
        setState({
          status: "error",
          message: event.message || "The depth worker crashed.",
        });
      });

      workerRef.current = worker;
    }

    const id = ++latestId.current;
    setState({ status: "estimating" });
    const request: DepthRequest = { type: "estimate", id, bitmap };
    worker.postMessage(request); // the bitmap is copied, so the page keeps its own
  }, []);

  return { state, backend, estimate };
}