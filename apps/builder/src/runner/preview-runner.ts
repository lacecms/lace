import { mkdir, mkdtemp, readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { previewExecutionSignal } from "./preview-deadline.js";
import type { PreviewRunnerSettings } from "./preview-settings.js";
import { stagePreviewSource, PreviewSourceError } from "./preview-source.js";
import { PreviewTransport, type PreviewArtifactResult } from "./preview-transport.js";
import { runBuildProcess } from "./process.js";
import type { PreviewJob } from "./schedule.js";
import { disjointRoots, type SourceSelection } from "./source.js";

const trustedTool = "/opt/lace-preview-tools/dist/preview-tool.js";
const knownReasons = new Set([
  "PREVIEW_CONFIGURATION_UNAVAILABLE",
  "PREVIEW_CONTEXT_CHANGED",
  "PREVIEW_SOURCE_UNAVAILABLE",
  "PREVIEW_DEPENDENCY_FAILED",
  "PREVIEW_ROUTE_CONFLICT",
  "PREVIEW_RENDER_FAILED",
  "PREVIEW_STORAGE_FAILED",
  "PREVIEW_RESOURCE_LIMIT",
  "PREVIEW_PROVIDER_UNAVAILABLE",
]);

/** The namespace supervisor has already terminated every process from the last run. */
export async function clearInterruptedPreviewWork(workRoot: string): Promise<void> {
  const names = await readdir(workRoot);
  for (const name of names) {
    if (/^preview-[A-Za-z0-9]{6}$/u.test(name))
      await rm(join(workRoot, name), { recursive: true, force: true });
  }
}

export function fixedPreviewRunner(
  input: SourceSelection & {
    readonly sourceRoot: string;
    readonly workRoot: string;
    readonly apiBaseUrl: string;
    readonly settings: PreviewRunnerSettings;
    readonly publicationSecrets: readonly string[];
  },
) {
  return async (job: PreviewJob, commit: string, stop: AbortSignal) => {
    const transport = new PreviewTransport(input.apiBaseUrl, job);
    const startedAt = Date.now();
    const execution = await transport.claim(
      commit,
      input.settings.bootstrapSecret,
      AbortSignal.any([stop, AbortSignal.timeout(30_000)]),
    );
    if (!execution) return;
    const { token, deadline } = execution;
    const signal = previewExecutionSignal(startedAt, deadline, stop);
    let scratch: string | undefined;
    let phase = "source";
    try {
      if (!disjointRoots([input.sourceRoot, input.workRoot]))
        throw new PreviewSourceError("unsupported");
      signal.throwIfAborted();
      await mkdir(input.workRoot, { recursive: true });
      scratch = await mkdtemp(join(input.workRoot, "preview-"));
      const project = join(scratch, "project");
      const detached = join(scratch, "input");
      const inputFile = join(detached, "input.json");
      const env = {
        PATH: process.env.PATH,
        HOME: scratch,
        ASTRO_TELEMETRY_DISABLED: "1",
        npm_config_manage_package_manager_versions: "false",
      };
      await stagePreviewSource(input.sourceRoot, commit, project, input, signal);
      phase = "input";
      const stage = await runBuildProcess({
        executable: process.execPath,
        args: [trustedTool],
        cwd: scratch,
        env,
        signal,
        phase,
        stdin: JSON.stringify({
          action: "stage",
          directory: detached,
          apiBaseUrl: input.apiBaseUrl,
          generationId: job.generationId,
          claim: token,
        }),
      });
      if (!stage.success) throw new Error("PREVIEW_STORAGE_FAILED");
      phase = "install";
      const install = await runBuildProcess({
        executable: "pnpm",
        args: ["install", "--frozen-lockfile"],
        cwd: project,
        env,
        signal,
        phase,
      });
      if (!install.success) throw new Error("PREVIEW_DEPENDENCY_FAILED");
      phase = "render";
      const build = await runBuildProcess({
        executable: "pnpm",
        args: ["--dir", input.siteDirectory, "exec", "astro", "build"],
        cwd: project,
        env: { ...env, LACE_PREVIEW_INPUT_FILE: inputFile },
        signal,
        phase,
      });
      if (!build.success) throw new Error("PREVIEW_RENDER_FAILED");
      phase = "package";
      const packaged = await runBuildProcess({
        executable: process.execPath,
        args: [trustedTool],
        cwd: scratch,
        env,
        signal,
        phase,
        stdin: JSON.stringify({
          action: "package",
          inputFile,
          forbiddenValues: [
            token,
            input.settings.secret,
            input.settings.bootstrapSecret,
            ...input.publicationSecrets,
          ],
        }),
      });
      const result = JSON.parse(packaged.output || "{}") as PreviewArtifactResult & {
        readonly reason?: string;
      };
      if (!packaged.success || result.directory !== join(detached, "render"))
        throw new Error(result.reason || "PREVIEW_RENDER_FAILED");
      phase = "upload";
      signal.throwIfAborted();
      await transport.upload(result, token, signal);
      console.info(
        JSON.stringify({
          component: "preview-builder",
          generationId: job.generationId,
          commit,
          status: "ready",
          durationMs: Date.now() - startedAt,
          files: result.manifest.files.length,
          bytes: result.manifest.files.reduce((total, file) => total + file.bytes, 0),
        }),
      );
    } catch (error) {
      const reason = signal.aborted
        ? "PREVIEW_TIMED_OUT"
        : error instanceof Error && knownReasons.has(error.message)
          ? error.message
          : "PREVIEW_PROVIDER_UNAVAILABLE";
      console.error(
        JSON.stringify({
          component: "preview-builder",
          generationId: job.generationId,
          commit,
          phase,
          reason,
        }),
      );
      if (!signal.aborted)
        await transport
          .complete({ outcome: "failed", reason }, token, signal)
          .catch(() => undefined);
    } finally {
      if (scratch) await rm(scratch, { recursive: true, force: true }).catch(() => undefined);
    }
  };
}
