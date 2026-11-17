import { BuildExportVersionChangedError, PreviewContextLimitError } from "@lacecms/domain";
import type { MediaId, PreviewFailureReason } from "@lacecms/domain";
import type { Clock } from "../ports/infrastructure.js";
import type { BuildContentExportPage } from "../ports/content.js";
import type {
  PreviewCapturePort,
  PreviewGeneration,
  PreviewInputStore,
  PreviewObject,
  PreviewReadPort,
} from "../ports/preview.js";

/** Three export pages at ten queries apiece leave room for fencing and failure on D1. */
const MAX_CONTEXT_PAGES = 3;
const MAX_CAPTURE_BYTES = 8 * 1024 * 1024;
const MAX_CAPTURE_MEDIA = 2000;

export interface PreviewCaptureDependencies {
  readonly preview: PreviewReadPort & PreviewCapturePort;
  readonly content: Pick<PreviewReadPort, "previewContextPage">;
  readonly clock: Clock;
  readonly store: PreviewInputStore;
}

export type PreviewCaptureResult =
  | { readonly kind: "sealed" }
  | { readonly kind: "failed"; readonly reason: PreviewFailureReason };

class CaptureFailure extends Error {
  public constructor(readonly reason: PreviewFailureReason) {
    super(reason);
  }
}

function withoutTarget(
  page: BuildContentExportPage,
  generation: PreviewGeneration,
): BuildContentExportPage {
  return {
    version: page.version,
    entries: page.entries.filter(({ entry }) => entry.id !== generation.entryId),
    records: page.records.filter(({ entry }) => entry.id !== generation.entryId),
    ...(page.globals === undefined ? {} : { globals: page.globals }),
  };
}

/** Stages the saved target separately so an unpublished target has no synthetic publication. */
export async function capturePreviewInput(
  { preview, content, clock, store }: PreviewCaptureDependencies,
  generation: PreviewGeneration,
): Promise<PreviewCaptureResult> {
  const { id } = generation;
  const deadline = () => {
    if (clock.now() >= generation.overallDeadline) throw new CaptureFailure("PREVIEW_TIMED_OUT");
  };
  try {
    deadline();
    const target = await preview.capturedPreviewTarget(id);
    if (target === null) throw new CaptureFailure("PREVIEW_CONTEXT_CHANGED");
    const targetObject = await store.writeTarget(id, target);
    const pages: PreviewObject[] = [];
    const media = new Set<MediaId>(target.media.map((item) => item.id));
    let bytes = targetObject.bytes;
    let after: BuildContentExportPage["nextCursor"];
    for (;;) {
      deadline();
      if (pages.length >= MAX_CONTEXT_PAGES) throw new CaptureFailure("PREVIEW_RESOURCE_LIMIT");
      const page = await content.previewContextPage({
        limit: 100,
        ...(after === undefined ? {} : { after }),
      });
      if (page.version !== generation.publicVersion)
        throw new CaptureFailure("PREVIEW_CONTEXT_CHANGED");
      const context = withoutTarget(page, generation);
      for (const item of [...context.entries, ...context.records, ...(context.globals ?? [])])
        for (const asset of item.media) media.add(asset.id);
      const stored = await store.writeContextPage(id, pages.length, context);
      pages.push(stored);
      bytes += stored.bytes;
      if (bytes > MAX_CAPTURE_BYTES || media.size > MAX_CAPTURE_MEDIA)
        throw new CaptureFailure("PREVIEW_RESOURCE_LIMIT");
      after = page.nextCursor;
      if (after === undefined) break;
    }
    deadline();
    if (!(await preview.trackPreviewMedia(id, [...media], clock.now())))
      throw new CaptureFailure("PREVIEW_CONTEXT_CHANGED");
    const manifest = await store.sealInput(id, targetObject, pages);
    deadline();
    if (!(await preview.sealPreviewInput(id, manifest, clock.now())))
      throw new CaptureFailure("PREVIEW_CONTEXT_CHANGED");
    return { kind: "sealed" };
  } catch (error) {
    const reason =
      error instanceof CaptureFailure
        ? error.reason
        : error instanceof PreviewContextLimitError
          ? "PREVIEW_RESOURCE_LIMIT"
          : error instanceof BuildExportVersionChangedError
            ? "PREVIEW_CONTEXT_CHANGED"
            : "PREVIEW_STORAGE_FAILED";
    // If recording failure also fails, maintenance owns recovery at the original deadline.
    await preview.failPreviewPreparation(id, reason, clock.now());
    return { kind: "failed", reason };
  }
}
