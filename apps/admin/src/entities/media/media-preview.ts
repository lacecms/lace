import { useState } from "react";
import { mediaPreviewPath } from "./media-limits.js";

/** Loading state of an admin preview image, with a cache-busting retry after a failure. */
export function useMediaPreview(mediaId: string) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<"loading" | "ready" | "failed">("loading");
  return {
    onError: () => setState("failed"),
    onLoad: () => setState("ready"),
    retry: () => {
      setState("loading");
      setAttempt((current) => current + 1);
    },
    source: `${mediaPreviewPath(mediaId)}${attempt === 0 ? "" : `?attempt=${attempt}`}`,
    state,
  };
}
