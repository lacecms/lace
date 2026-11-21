import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import { join } from "node:path";
import type { PreviewJob } from "./schedule.js";

interface ArtifactFile {
  readonly path: string;
  readonly sha256: string;
  readonly bytes: number;
}

export interface PreviewArtifactResult {
  readonly directory: string;
  readonly manifest: { readonly files: readonly ArtifactFile[] };
  readonly mediaIds: readonly string[];
}

export class PreviewTransport {
  readonly #endpoint: URL;

  public constructor(
    public readonly apiUrl: string,
    public readonly job: PreviewJob,
  ) {
    this.#endpoint = new URL(`api/v1/preview-runner/${job.generationId}/`, apiUrl);
  }

  public async claim(commit: string, bootstrap: string, signal: AbortSignal) {
    const response = await this.send("claim", bootstrap, signal, {
      method: "POST",
      json: { commit, runId: this.job.reservationId },
    });
    if (response.status === 409) {
      await response.body?.cancel();
      return null;
    }
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error("PREVIEW_PROVIDER_UNAVAILABLE");
    }
    const value = (await response.json()) as { token?: unknown; deadline?: unknown };
    if (
      typeof value.token !== "string" ||
      typeof value.deadline !== "number" ||
      !Number.isSafeInteger(value.deadline)
    )
      throw new Error("PREVIEW_PROVIDER_UNAVAILABLE");
    return { token: value.token, deadline: value.deadline };
  }

  public async upload(output: PreviewArtifactResult, token: string, signal: AbortSignal) {
    const response = await this.send("artifacts/manifest", token, signal, {
      method: "POST",
      json: { manifest: output.manifest, mediaIds: output.mediaIds },
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error("PREVIEW_STORAGE_FAILED");
    }
    const manifest: unknown = await response.json();
    for (const file of output.manifest.files) {
      signal.throwIfAborted();
      const source = createReadStream(join(output.directory, file.path));
      try {
        const result = await this.send(`artifacts/files/${file.path}`, token, signal, {
          method: "PUT",
          file: { ...file, body: Readable.toWeb(source) as ReadableStream<Uint8Array> },
        });
        await result.body?.cancel();
        if (!result.ok) throw new Error("PREVIEW_STORAGE_FAILED");
      } finally {
        source.destroy();
      }
    }
    await this.complete({ outcome: "ready", manifest }, token, signal);
  }

  public async complete(json: object, token: string, signal: AbortSignal) {
    const result = await this.send("complete", token, signal, { method: "POST", json });
    await result.body?.cancel();
    if (!result.ok) throw new Error("PREVIEW_STORAGE_FAILED");
  }

  private send(
    path: string,
    token: string,
    signal: AbortSignal,
    options: {
      readonly method: "POST" | "PUT";
      readonly json?: object;
      readonly file?: ArtifactFile & { readonly body: ReadableStream<Uint8Array> };
    },
  ) {
    const headers = new Headers({ authorization: `Bearer ${token}` });
    if (options.file) {
      headers.set("content-length", String(options.file.bytes));
      headers.set("content-type", "application/octet-stream");
      headers.set("x-lace-sha256", options.file.sha256);
    } else headers.set("content-type", "application/json");
    const init: RequestInit & { duplex?: "half" } = {
      method: options.method,
      headers,
      signal,
      redirect: "error",
      ...(options.file
        ? { body: options.file.body, duplex: "half" }
        : { body: JSON.stringify(options.json) }),
    };
    return fetch(new URL(path, this.#endpoint), init);
  }
}
