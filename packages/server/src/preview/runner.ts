import {
  PREVIEW_FILE_BYTES,
  PREVIEW_MANIFEST_BYTES,
  PreviewFrozenInputs,
} from "@lacecms/application";
import type {
  Clock,
  MediaReadPort,
  MediaUseCases,
  PreviewBlobStorage,
  PreviewCommandPort,
  PreviewPackages,
} from "@lacecms/application";
import { mediaSha256Schema, previewCompletionRequestSchema } from "@lacecms/contracts";
import {
  frozenPreviewInputSchema,
  previewArtifactPathSchema,
  previewGenerationIdSchema,
} from "@lacecms/contracts/preview";
import * as v from "valibot";
import { binaryStream } from "../shared/binary.js";
import { exportSeo, type ServerConfig } from "../shared/content-config.js";
import { previewResponse, privatePreviewHeaders } from "./handoff.js";
import { previewRunnerClaim, readRunnerClaim, runnerJson } from "./runner-claim.js";
import { runnerInput, type PreviewInputMetadata } from "./runner-input.js";

const manifestUpload = v.strictObject({
  manifest: v.unknown(),
  mediaIds: v.pipe(v.array(previewGenerationIdSchema), v.maxLength(2000)),
});

async function* fileBytes(source: ReadableStream<Uint8Array>) {
  const reader = source.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return;
      yield value;
    }
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

function json(value: unknown) {
  return Response.json(value, { headers: privatePreviewHeaders() });
}

/** The caller mounts this only on its dedicated runner ingress. */
export function createPreviewRunner(input: {
  readonly siteUrl: string;
  readonly config: ServerConfig;
  readonly blobs: PreviewBlobStorage;
  readonly commands: PreviewCommandPort;
  readonly packages: PreviewPackages;
  readonly mediaRead: MediaReadPort;
  readonly media: Pick<MediaUseCases, "openBinary">;
  readonly executor: string;
  readonly bootstrapSecret: string;
  readonly acceptsRun: Parameters<typeof previewRunnerClaim>[0]["acceptsRun"];
  readonly sitePath?: string;
  readonly clock: Clock;
}) {
  const { clock, commands, executor, packages } = input;
  const frozen = new PreviewFrozenInputs<PreviewInputMetadata>(input.blobs, {
    siteUrl: input.siteUrl,
    seo: exportSeo(input.config),
  });
  const claim = previewRunnerClaim(input);
  async function fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const match = /^\/api\/v1\/preview-runner\/([A-Za-z0-9_-]{1,128})\/(.+)(?![\s\S])/u.exec(
      url.pathname,
    );
    if (!match) return previewResponse(404);
    const [, id, operation] = match as unknown as [string, string, string];
    if (operation === "claim" && request.method === "POST" && !url.search) {
      const result = await claim(request, id);
      return result.status === 200
        ? json({
            token: result.token,
            deadline: result.deadline,
            ...(input.sitePath && { sitePath: input.sitePath }),
          })
        : previewResponse(result.status);
    }
    const scope = await readRunnerClaim(request, id, executor, clock);
    if (!scope) return previewResponse(401);
    if (operation === "complete" && request.method === "POST" && !url.search) {
      const completion = v.safeParse(
        previewCompletionRequestSchema,
        await runnerJson(request, 1024),
      );
      if (!completion.success) return previewResponse(400);
      const result =
        completion.output.outcome === "ready"
          ? await packages.completeOutput(scope, completion.output.manifest)
          : await commands.failPreview(id, completion.output.reason, clock.now(), scope);
      return previewResponse(result ? 204 : 409);
    }
    const execution = await commands.runningPreview(scope);
    if (!execution) return previewResponse(409);
    if (
      (operation === "input" && request.method === "GET") ||
      (operation === "artifacts/manifest" && request.method === "POST" && !url.search)
    ) {
      const stored = await frozen.read(id, execution.input);
      if (!stored) return previewResponse(503);
      const mapped = runnerInput(execution, stored);
      const capturedMedia = new Map(
        [
          ...stored.target.media,
          ...stored.pages.flatMap((page) =>
            [...page.entries, ...page.records, ...(page.globals ?? [])].flatMap(
              (item) => item.media,
            ),
          ),
        ].map(({ id: mediaId }) => [String(mediaId), mediaId]),
      );
      if (operation === "artifacts/manifest") {
        const parsed = v.safeParse(
          manifestUpload,
          await runnerJson(request, PREVIEW_MANIFEST_BYTES + 300_000),
        );
        if (
          !parsed.success ||
          !parsed.output.mediaIds.every((mediaId) => capturedMedia.has(mediaId)) ||
          new Set(parsed.output.mediaIds).size !== parsed.output.mediaIds.length
        )
          return previewResponse(400);
        const output = await packages.prepareOutput(
          scope,
          parsed.output.manifest,
          parsed.output.mediaIds.map((mediaId) => capturedMedia.get(mediaId)!),
        );
        return output ? json(output) : previewResponse(409);
      }
      if (!url.search) {
        if (!(await commands.runningPreview({ ...scope, now: clock.now() })))
          return previewResponse(409);
        const parsed = v.safeParse(frozenPreviewInputSchema, mapped);
        return parsed.success ? json(parsed.output) : previewResponse(503);
      }
      const mediaId = url.searchParams.get("mediaId");
      if (!mediaId || url.searchParams.size !== 1 || !capturedMedia.has(mediaId))
        return previewResponse(404);
      const media = await input.mediaRead.loadMedia(mediaId);
      if (
        !media ||
        media.status !== "active" ||
        media.size > 10 * 1024 * 1024 ||
        !(await commands.runningPreview({ ...scope, now: clock.now() }))
      )
        return previewResponse(404);
      const binary = await input.media.openBinary(media);
      const stream = binaryStream(binary.body);
      if (!(await commands.runningPreview({ ...scope, now: clock.now() }))) {
        await stream.cancel();
        return previewResponse(409);
      }
      const headers = privatePreviewHeaders();
      headers.set("content-type", binary.mimeType);
      headers.set("content-length", String(media.size));
      return new Response(stream, { headers });
    }
    if (operation.startsWith("artifacts/files/") && request.method === "PUT" && !url.search) {
      const path = operation.slice("artifacts/files/".length);
      const sha256 = request.headers.get("x-lace-sha256");
      const length = request.headers.get("content-length");
      const bytes = Number(length);
      if (
        (bytes > 0 && !request.body) ||
        request.headers.get("content-type") !== "application/octet-stream" ||
        !v.is(previewArtifactPathSchema, path) ||
        !v.is(mediaSha256Schema, sha256) ||
        !Number.isSafeInteger(bytes) ||
        bytes < 0 ||
        bytes > PREVIEW_FILE_BYTES ||
        length !== String(bytes)
      )
        return previewResponse(400);
      const result = await packages.stage(
        scope,
        path,
        { bytes, sha256 },
        request.body && bytes > 0 ? fileBytes(request.body) : new Uint8Array(0),
      );
      return previewResponse(result ? 204 : 409);
    }
    return previewResponse(404);
  }
  return { frozen, fetch };
}
