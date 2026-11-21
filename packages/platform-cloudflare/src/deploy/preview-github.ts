import type { PreviewGeneration } from "@lacecms/application";
import type { PreviewFailureReason } from "@lacecms/domain";
import { boundedText } from "./bounded-body.js";

export interface GitHubPreviewSettings {
  readonly repository: string;
  readonly ref: string;
  readonly workflow: string;
  readonly token: string;
}

export const githubPreviewExecutor = "github-actions";

export function isGitHubPreviewExecutor(value: string): boolean {
  return value === githubPreviewExecutor || value.startsWith(`${githubPreviewExecutor}-`);
}
const sha = /^[0-9a-f]{40}(?![\s\S])/u;
const numericId = /^[1-9][0-9]{0,15}(?![\s\S])/u;
const generationId = /^[A-Za-z0-9_-]{1,128}(?![\s\S])/u;

export class GitHubPreviewError extends Error {
  public constructor(
    readonly reason: PreviewFailureReason,
    readonly category: "source" | "credentials" | "quota" | "provider" | "correlation",
  ) {
    super(reason);
  }
}

function unavailable(category: GitHubPreviewError["category"] = "provider") {
  return new GitHubPreviewError("PREVIEW_PROVIDER_UNAVAILABLE", category);
}

function runId(value: unknown): string | undefined {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0
    ? String(value)
    : undefined;
}

export interface GitHubPreviewRun {
  readonly attempt: number;
  readonly matchesSource: boolean;
  readonly completed: boolean;
  readonly conclusion?: string;
}

/** GitHub Actions only. Never use provider-returned URLs or search for the latest run. */
export class GitHubPreview {
  private readonly base: URL;
  private readonly workflowPath: string;
  public constructor(
    private readonly settings: GitHubPreviewSettings,
    private readonly fetcher: typeof fetch = fetch.bind(globalThis),
    public readonly executor = githubPreviewExecutor,
  ) {
    this.base = new URL(`https://api.github.com/repos/${settings.repository}/`);
    this.workflowPath = `.github/workflows/${settings.workflow}`;
  }

  private async request(path: string, body?: unknown): Promise<Readonly<Record<string, unknown>>> {
    const commitLookup = path.startsWith("commits/");
    try {
      const response = await this.fetcher(new URL(path, this.base), {
        method: body === undefined ? "GET" : "POST",
        headers: {
          accept: commitLookup ? "application/vnd.github.sha" : "application/vnd.github+json",
          authorization: `Bearer ${this.settings.token}`,
          "content-type": "application/json",
          "user-agent": "Lace-Preview",
          "x-github-api-version": "2026-03-10",
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        redirect: "manual",
        signal: AbortSignal.timeout(8_000),
      });
      if (!response.ok) {
        await response.body?.cancel();
        if (
          response.status === 429 ||
          response.headers.get("x-ratelimit-remaining") === "0" ||
          response.headers.has("retry-after")
        )
          throw new GitHubPreviewError("PREVIEW_PROVIDER_QUOTA", "quota");
        if (response.status === 401 || response.status === 403)
          throw new GitHubPreviewError("PREVIEW_CONFIGURATION_UNAVAILABLE", "credentials");
        if (commitLookup && response.status === 404)
          throw new GitHubPreviewError("PREVIEW_SOURCE_UNAVAILABLE", "source");
        throw unavailable();
      }
      if (response.status === 202 || response.status === 204) return {};
      if (commitLookup) return { sha: (await boundedText(response, 128))?.trim() };
      const raw: unknown = JSON.parse((await boundedText(response, 64 * 1024)) ?? "null");
      if (typeof raw !== "object" || raw === null || Array.isArray(raw)) throw unavailable();
      return raw as Record<string, unknown>;
    } catch (error) {
      throw error instanceof GitHubPreviewError ? error : unavailable();
    }
  }

  public async source() {
    const result = await this.request(`commits/${encodeURIComponent(this.settings.ref)}`);
    if (typeof result.sha !== "string" || !sha.test(result.sha))
      throw new GitHubPreviewError("PREVIEW_SOURCE_UNAVAILABLE", "source");
    return { commit: result.sha, executor: this.executor };
  }

  public async dispatch(generation: PreviewGeneration): Promise<string> {
    if (
      !generationId.test(generation.id) ||
      !sha.test(generation.source.commit) ||
      generation.source.executor !== this.executor
    )
      throw unavailable("correlation");
    const result = await this.request(`actions/workflows/${this.settings.workflow}/dispatches`, {
      ref: this.settings.ref,
      inputs: { generation: generation.id, commit: generation.source.commit },
    });
    const id = runId(result.workflow_run_id);
    if (!id) throw unavailable("correlation");
    return id;
  }

  public async run(generation: PreviewGeneration, id: string): Promise<GitHubPreviewRun> {
    if (!numericId.test(id) || !isGitHubPreviewExecutor(generation.source.executor))
      throw unavailable("correlation");
    const result = await this.request(`actions/runs/${id}`);
    // GitHub may append @ref to the canonical workflow path.
    if (
      runId(result.id) !== id ||
      typeof result.path !== "string" ||
      result.path.split("@", 1)[0] !== this.workflowPath ||
      result.display_title !== `Lace preview ${generation.id}` ||
      result.event !== "workflow_dispatch" ||
      typeof result.run_attempt !== "number" ||
      !Number.isSafeInteger(result.run_attempt) ||
      result.run_attempt < 1 ||
      typeof result.head_sha !== "string" ||
      !sha.test(result.head_sha) ||
      typeof result.status !== "string"
    )
      throw unavailable("correlation");
    return {
      attempt: result.run_attempt,
      matchesSource: result.head_sha === generation.source.commit,
      completed: result.status === "completed",
      ...(typeof result.conclusion === "string" ? { conclusion: result.conclusion } : {}),
    };
  }

  public async cancel(
    generation: PreviewGeneration,
    id: string,
  ): Promise<"stopped" | "unconfirmed"> {
    const run = await this.run(generation, id);
    if (run.completed) return "stopped";
    await this.request(`actions/runs/${id}/cancel`, {});
    return "unconfirmed";
  }
}
