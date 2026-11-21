import { createHash } from "node:crypto";
import { capturePreviewInput, PreviewAdmissionService } from "@lacecms/application";
import type {
  MediaUseCases,
  PreviewAdmissionDependencies,
  PreviewBlobStorage,
  PreviewPackages,
  PreviewStopTarget,
} from "@lacecms/application";
import type { ContentModelDefinition, NormalizedConfig } from "@lacecms/config";
import { createPreviewRunner } from "@lacecms/server";
import {
  GitHubPreview,
  GitHubPreviewError,
  githubPreviewExecutor,
  isGitHubPreviewExecutor,
} from "../deploy/preview-github.js";
import type { D1ContentRepository } from "../repository/repository.js";
import type { CloudflarePreviewSettings } from "./preview-settings.js";

export function composeCloudflarePreview(
  input: Pick<PreviewAdmissionDependencies, "clock" | "idGenerator"> & {
    readonly adminOrigin: URL;
    readonly config: NormalizedConfig<readonly ContentModelDefinition[]>;
    readonly settings: CloudflarePreviewSettings;
    readonly repository: D1ContentRepository;
    readonly blobs: PreviewBlobStorage;
    readonly packages: PreviewPackages;
    readonly media: MediaUseCases;
    readonly fetcher?: typeof fetch;
    readonly log: (level: "info" | "error", data: Record<string, string>) => void;
  },
) {
  const { settings, repository, clock } = input;
  const preview = repository.preview;
  const identity = createHash("sha256")
    .update(
      JSON.stringify([
        settings.github.repository.toLowerCase(),
        settings.github.ref,
        settings.github.workflow,
        settings.sitePath,
        settings.siteUrl,
      ]),
    )
    .digest("hex");
  const github = new GitHubPreview(
    settings.github,
    input.fetcher,
    `${githubPreviewExecutor}-${identity}`,
  );
  async function stop(generation: PreviewStopTarget): Promise<"stopped" | "unconfirmed"> {
    if (!isGitHubPreviewExecutor(generation.source.executor)) return "unconfirmed";
    // A dispatch with no recorded run can never have received a claim.
    return generation.run ? github.cancel(generation, generation.run) : "stopped";
  }
  const runner = createPreviewRunner({
    ...input,
    siteUrl: settings.siteUrl,
    sitePath: settings.sitePath,
    commands: preview,
    executor: github.executor,
    mediaRead: repository,
    bootstrapSecret: settings.bootstrapSecret,
    acceptsRun: async (id, runId, commit) => {
      const dispatched = await preview.dispatchedPreview(id, runId);
      if (
        !dispatched ||
        dispatched.source.executor !== github.executor ||
        dispatched.source.commit !== commit ||
        dispatched.overallDeadline <= clock.now()
      )
        return false;
      const run = await github.run(dispatched, runId);
      return run.matchesSource && run.attempt === 1 && !run.completed;
    },
  });
  const admission = new PreviewAdmissionService({
    ...input,
    config: input.config.runtime,
    preview,
    content: repository,
    media: repository,
    reserveSource: async () => {
      if (await preview.hasPreviewExecutionSlot()) {
        const pending = await preview.previewExecutorToStop();
        if (!pending || (await stop(pending).catch(() => "unconfirmed")) !== "stopped")
          return { reason: "PREVIEW_BUSY" };
        await preview.confirmPreviewExecutorStopped(pending.id, clock.now());
      }
      try {
        return { source: await github.source(), release: async () => {} };
      } catch (error) {
        return {
          reason:
            error instanceof GitHubPreviewError ? error.reason : "PREVIEW_PROVIDER_UNAVAILABLE",
        };
      }
    },
  });
  return {
    transport: { origin: input.adminOrigin, fetch: runner.fetch },
    async reconcile() {
      const generation = await preview.activePreviewRun(clock.now());
      if (!generation || !isGitHubPreviewExecutor(generation.source.executor)) return;
      const runId = generation.run;
      try {
        const run = await github.run(generation, runId);
        if (
          generation.source.executor === github.executor &&
          run.matchesSource &&
          run.attempt === 1 &&
          !run.completed
        )
          return;
        const reason = !run.matchesSource
          ? "PREVIEW_SOURCE_UNAVAILABLE"
          : run.conclusion === "timed_out"
            ? "PREVIEW_TIMED_OUT"
            : "PREVIEW_PROVIDER_UNAVAILABLE";
        if (await preview.failPreviewRun(generation.id, runId, reason, clock.now())) {
          input.log("info", {
            generationId: generation.id,
            commit: generation.source.commit,
            runId,
            reason,
          });
          if (run.completed)
            await preview.confirmPreviewExecutorStopped(generation.id, clock.now());
        }
      } catch (error) {
        input.log("error", {
          generationId: generation.id,
          runId,
          reason:
            error instanceof GitHubPreviewError ? error.reason : "PREVIEW_PROVIDER_UNAVAILABLE",
          ...(error instanceof GitHubPreviewError && { provider: error.category }),
        });
      }
    },
    stop,
    status: admission.status.bind(admission),
    async create(...args: Parameters<PreviewAdmissionService["create"]>) {
      const result = await admission.create(...args);
      if (result.kind !== "admitted") return result;
      const { generation } = result;
      try {
        const captured = await capturePreviewInput(
          { preview, clock, content: preview, store: runner.frozen },
          generation,
        );
        if (captured.kind !== "sealed") return result;
        const runId = await github.dispatch(generation);
        if (await preview.bindPreviewRun(generation.id, runId, clock.now())) {
          input.log("info", {
            generationId: generation.id,
            commit: generation.source.commit,
            runId,
            status: "dispatched",
          });
        } else {
          await github.cancel(generation, runId);
        }
      } catch (error) {
        const reason =
          error instanceof GitHubPreviewError ? error.reason : "PREVIEW_PROVIDER_UNAVAILABLE";
        input.log("error", {
          generationId: generation.id,
          reason,
          ...(error instanceof GitHubPreviewError && { provider: error.category }),
        });
        await preview.failPreview(generation.id, reason, clock.now());
      }
      return result;
    },
  };
}
