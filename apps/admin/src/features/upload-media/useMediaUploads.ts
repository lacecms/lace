import type { MediaMetadataDto } from "@lacecms/contracts";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { validateMediaFile } from "../../entities/media/index.js";
import { useSessionRecovery } from "../../entities/session/index.js";
import { adminQueryKeys, errorDescription, useAdminClient } from "../../shared/api/index.js";

/** How many files upload at the same time; the rest wait in order. */
export const MEDIA_UPLOAD_CONCURRENCY = 2;

export type MediaUploadState = "failed" | "queued" | "rejected" | "uploaded" | "uploading";

/** One file's upload as shown to the user. */
export interface MediaUploadEntry {
  readonly file: File;
  readonly item?: MediaMetadataDto;
  readonly key: string;
  readonly message?: string;
  /** Fraction of bytes sent (0–1) while uploading, when the browser reports it. */
  readonly progress?: number;
  readonly state: MediaUploadState;
}

const rejectionMessages = {
  size: "This file is larger than 10 MiB.",
  type: "This file type is not supported. Use JPEG, PNG, GIF, WebP, or AVIF.",
} as const;

let sequence = 0;

/**
 * An ordered upload queue. Files failing the local type or size check are
 * rejected without a request; accepted files upload independently with their
 * own progress and server error, and failed ones can be retried.
 */
export function useMediaUploads() {
  const client = useAdminClient();
  const queryClient = useQueryClient();
  const [uploads, setUploads] = useState<readonly MediaUploadEntry[]>([]);
  const [sessionError, setSessionError] = useState<unknown>(null);
  const started = useRef(new Set<string>());
  useSessionRecovery(sessionError);

  const update = useCallback((key: string, change: Partial<MediaUploadEntry>) => {
    setUploads((current) =>
      current.map((upload) => (upload.key === key ? { ...upload, ...change } : upload)),
    );
  }, []);

  useEffect(() => {
    const active = uploads.filter((upload) => upload.state === "uploading").length;
    const next = uploads
      .filter((upload) => upload.state === "queued" && !started.current.has(upload.key))
      .slice(0, Math.max(0, MEDIA_UPLOAD_CONCURRENCY - active));
    for (const upload of next) {
      started.current.add(upload.key);
      update(upload.key, { state: "uploading" });
      client
        .uploadMedia(upload.file, {
          onProgress: (progress) => update(upload.key, { progress }),
        })
        .then(
          async (item) => {
            update(upload.key, { item, progress: 1, state: "uploaded" });
            await queryClient.invalidateQueries({ queryKey: adminQueryKeys.media });
          },
          (error: unknown) => {
            setSessionError(error);
            update(upload.key, { message: errorDescription(error), state: "failed" });
          },
        )
        .finally(() => started.current.delete(upload.key));
    }
  }, [client, queryClient, update, uploads]);

  const add = useCallback((files: readonly File[]) => {
    const added = files.map((file): MediaUploadEntry => {
      sequence += 1;
      const key = `upload-${sequence}`;
      const rejection = validateMediaFile(file);
      return rejection === undefined
        ? { file, key, state: "queued" }
        : { file, key, message: rejectionMessages[rejection], state: "rejected" };
    });
    setUploads((current) => [...current, ...added]);
  }, []);

  const retry = useCallback((key: string) => {
    setUploads((current) =>
      current.map((upload) =>
        upload.key === key && upload.state === "failed"
          ? { file: upload.file, key: upload.key, state: "queued" }
          : upload,
      ),
    );
  }, []);

  const dismiss = useCallback((key: string) => {
    setUploads((current) =>
      current.filter(
        (upload) => upload.key !== key || upload.state === "queued" || upload.state === "uploading",
      ),
    );
  }, []);

  const clearFinished = useCallback(() => {
    setUploads((current) =>
      current.filter((upload) => upload.state === "queued" || upload.state === "uploading"),
    );
  }, []);

  return { add, clearFinished, dismiss, retry, uploads };
}
