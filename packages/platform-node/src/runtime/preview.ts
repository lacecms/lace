import { capturePreviewInput, PreviewAdmissionService } from "@lacecms/application";
import type {
  PreviewAdmissionDependencies,
  PreviewBlobStorage,
  PreviewPackages,
  MediaUseCases,
} from "@lacecms/application";
import type { NodeContentRepository } from "@lacecms/db/node";
import type { ContentModelDefinition, NormalizedConfig } from "@lacecms/config";
import { createPreviewRunner } from "@lacecms/server";
import { NodePreviewBuilder, nodePreviewExecutor } from "../builds/preview-builder.js";
import type { NodePreviewSettings } from "./preview-settings.js";

export function composeNodePreview(
  input: Pick<PreviewAdmissionDependencies, "clock" | "idGenerator"> & {
    readonly config: NormalizedConfig<readonly ContentModelDefinition[]>;
    readonly settings: NodePreviewSettings;
    readonly repository: NodeContentRepository;
    readonly blobs: PreviewBlobStorage;
    readonly packages: PreviewPackages;
    readonly media: MediaUseCases;
    readonly log: (generationId: string) => void;
  },
) {
  const { settings, repository, clock } = input;
  const preview = repository.preview;
  const builder = new NodePreviewBuilder({
    baseUrl: settings.builderOrigin,
    secret: settings.builderSecret,
  });
  const runner = createPreviewRunner({
    ...input,
    siteUrl: settings.siteUrl,
    commands: preview,
    executor: nodePreviewExecutor,
    mediaRead: repository,
    bootstrapSecret: settings.bootstrapSecret,
    acceptsRun: (id, run) => builder.reservationId(id) === run,
  });
  const admission = new PreviewAdmissionService({
    ...input,
    config: input.config.runtime,
    preview,
    content: repository,
    media: repository,
    reserveSource: (id) => builder.reserve(id),
  });
  return {
    transport: { origin: settings.runnerOrigin, fetch: runner.fetch },
    builder,
    async create(...args: Parameters<PreviewAdmissionService["create"]>) {
      const result = await admission.create(...args);
      if (result.kind !== "admitted") return result;
      const { generation } = result;
      let dispatched = false;
      try {
        const captured = await capturePreviewInput(
          { preview, clock, content: preview, store: runner.frozen },
          generation,
        );
        if (captured.kind === "sealed") {
          try {
            await builder.dispatch(generation);
            dispatched = true;
          } catch (error) {
            const busy = error instanceof Error && error.message === "PREVIEW_BUSY";
            await preview.failPreview(
              generation.id,
              busy ? "PREVIEW_BUSY" : "PREVIEW_PROVIDER_UNAVAILABLE",
              clock.now(),
            );
          }
        }
      } catch {
        input.log(generation.id);
      } finally {
        if (!dispatched) await builder.stop(generation);
      }
      return result;
    },
  };
}
