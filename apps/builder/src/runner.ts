import { normalizeBuildFailure, type SiteBuildFailureReason } from "./diagnostics.js";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import {
  chmod,
  cp,
  lstat,
  mkdir,
  mkdtemp,
  readdir,
  readlink,
  rename,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { basename, join, relative } from "node:path";

import { copySource, disjointRoots, SourceError, type SourceSelection } from "./source.js";

export interface BuildRequest {
  readonly buildId: string;
  readonly targetVersion: number;
}

export type BuildResult =
  | Readonly<{ readonly status: "succeeded" }>
  | Readonly<{
      readonly status: "failed";
      readonly reason: SiteBuildFailureReason;
      readonly path?: string;
    }>;

export interface BuilderSettings extends SourceSelection {
  readonly sourceRoot: string;
  readonly workRoot: string;
  readonly outputRoot: string;
  readonly apiBaseUrl: string;
  readonly buildToken: string;
  readonly publicBaseUrl?: string;
  /** Internal test seam; production always uses image-pinned pnpm from PATH. */
  readonly toolPath?: string;
  /** Internal test seam; production reads the published export ETag. */
  readonly versionReader?: () => Promise<number>;
}

type Stage = "source_invalid" | "install_failed" | "build_failed" | "version_changed";

class StageError extends Error {
  public constructor(readonly stage: Stage) {
    super(stage);
  }
}

async function execute(
  cwd: string,
  args: readonly string[],
  environment: NodeJS.ProcessEnv,
  toolPath: string,
  phase: "install" | "build",
): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn(toolPath, [...args], {
      cwd,
      env: environment,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    const collect = (chunk: Buffer) => {
      output = (output + chunk.toString("utf8")).slice(-16_384);
    };
    child.stdout.on("data", collect);
    child.stderr.on("data", collect);
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, 10 * 60_000);
    child.on("error", () => {
      clearTimeout(timeout);
      console.error(JSON.stringify({ component: "builder-tool", phase, failure: "spawn_failed" }));
      resolve(false);
    });
    child.on("close", (code, signal) => {
      clearTimeout(timeout);
      if (code !== 0) {
        const failure = timedOut
          ? "timeout"
          : /ENOSPC|no space left on device/iu.test(output)
            ? "disk_full"
            : /ENOMEM|out of memory|heap out of memory/iu.test(output)
              ? "memory_exhausted"
              : /EACCES|permission denied/iu.test(output)
                ? "permission_denied"
                : /ERR_MODULE_NOT_FOUND|Cannot find (?:module|package)/iu.test(output)
                  ? "missing_dependency"
                  : /fetch failed|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|ETIMEDOUT/iu.test(output)
                    ? "network_unavailable"
                    : signal === null
                      ? "command_failed"
                      : "signal";
        console.error(JSON.stringify({ component: "builder-tool", phase, failure }));
      }
      resolve(code === 0);
    });
  });
}

async function currentVersion(settings: BuilderSettings): Promise<number> {
  try {
    const url = new URL("api/v1/public/build-export", settings.apiBaseUrl);
    const response = await fetch(url, {
      headers: { authorization: `Bearer ${settings.buildToken}` },
      signal: AbortSignal.timeout(30_000),
    });
    await response.body?.cancel();
    const etag = response.headers.get("etag");
    if (!response.ok || etag === null || !/^"(?:0|[1-9][0-9]*)"$/u.test(etag)) throw new Error();
    const version = Number(etag.slice(1, -1));
    if (!Number.isSafeInteger(version)) throw new Error();
    return version;
  } catch {
    throw new StageError("version_changed");
  }
}

async function pruneReleases(
  releasesRoot: string,
  currentName: string,
  previousName?: string,
): Promise<void> {
  const entries = await readdir(releasesRoot, { withFileTypes: true });
  const keep = new Set([currentName, previousName]);
  for (const entry of entries) {
    if (entry.isDirectory() && !keep.has(entry.name))
      await rm(join(releasesRoot, entry.name), { recursive: true, force: true });
  }
}

export class FixedCommandBuilder {
  public constructor(private readonly settings: BuilderSettings) {
    if (settings.buildToken.length === 0) throw new TypeError("Build token is required.");
    const api = new URL(settings.apiBaseUrl);
    if (!["http:", "https:"].includes(api.protocol) || !api.pathname.endsWith("/"))
      throw new TypeError("API base URL must be an HTTP URL ending in /.");
  }

  public async build(request: BuildRequest): Promise<BuildResult> {
    const { sourceRoot, workRoot, outputRoot } = this.settings;
    let workDirectory: string | undefined;
    let releaseDirectory: string | undefined;
    try {
      if (!disjointRoots([sourceRoot, workRoot, outputRoot]))
        throw new StageError("source_invalid");
      await mkdir(workRoot, { recursive: true });
      const releasesRoot = join(outputRoot, "releases");
      await mkdir(releasesRoot, { recursive: true });
      workDirectory = await mkdtemp(join(workRoot, "build-"));
      const project = join(workDirectory, "project");
      try {
        await copySource(sourceRoot, project, this.settings);
      } catch (error) {
        if (error instanceof SourceError) throw error;
        throw new StageError("source_invalid");
      }
      if (
        (await (this.settings.versionReader?.() ?? currentVersion(this.settings))) !==
        request.targetVersion
      )
        throw new StageError("version_changed");
      const environment: NodeJS.ProcessEnv = {
        PATH: process.env.PATH,
        HOME: workDirectory,
        PNPM_HOME: process.env.PNPM_HOME,
        ASTRO_TELEMETRY_DISABLED: "1",
        LACE_SITE_DATA_MODE: "live",
        LACE_API_BASE_URL: this.settings.apiBaseUrl,
        LACE_BUILD_TOKEN: this.settings.buildToken,
        LACE_EXPECTED_PUBLISHED_VERSION: String(request.targetVersion),
        ...(this.settings.publicBaseUrl === undefined
          ? {}
          : { LACE_PUBLIC_BASE_URL: this.settings.publicBaseUrl }),
      };
      if (
        !(await execute(
          project,
          ["install", "--frozen-lockfile"],
          environment,
          this.settings.toolPath ?? "pnpm",
          "install",
        ))
      )
        throw new StageError("install_failed");
      // A non-workspace package must not accidentally use Astro installed at the root.
      try {
        await lstat(join(project, this.settings.siteDirectory, "node_modules/astro"));
      } catch {
        throw new StageError("source_invalid");
      }
      if (
        !(await execute(
          project,
          [
            "--dir",
            this.settings.siteDirectory,
            "exec",
            "astro",
            "build",
            "--outDir",
            this.settings.outputDirectory,
          ],
          environment,
          this.settings.toolPath ?? "pnpm",
          "build",
        ))
      )
        throw new StageError("build_failed");
      const siteOutput = join(project, this.settings.siteDirectory, this.settings.outputDirectory);
      if (!(await lstat(join(siteOutput, "index.html"))).isFile())
        throw new StageError("build_failed");
      if (
        (await (this.settings.versionReader?.() ?? currentVersion(this.settings))) !==
        request.targetVersion
      )
        throw new StageError("version_changed");
      releaseDirectory = await mkdtemp(join(releasesRoot, "release-"));
      await cp(siteOutput, releaseDirectory, {
        recursive: true,
        filter: async (path) => {
          const stat = await lstat(path);
          if (!stat.isFile() && !stat.isDirectory()) throw new StageError("build_failed");
          return true;
        },
      });
      // mkdtemp creates 0700 directories; the read-only web server runs as another user.
      await chmod(releaseDirectory, 0o755);
      await writeFile(
        join(releaseDirectory, ".lace-release.json"),
        JSON.stringify({ version: request.targetVersion }),
      );
      if (
        (await (this.settings.versionReader?.() ?? currentVersion(this.settings))) !==
        request.targetVersion
      )
        throw new StageError("version_changed");
      let previousName: string | undefined;
      try {
        const oldTarget = await readlink(join(outputRoot, "current"));
        if (/^releases\/release-[A-Za-z0-9-]+$/u.test(oldTarget))
          previousName = basename(oldTarget);
      } catch {
        /* no active release yet */
      }
      const link = join(outputRoot, `.current-${randomUUID()}`);
      await symlink(relative(outputRoot, releaseDirectory), link);
      try {
        await rename(link, join(outputRoot, "current"));
      } catch (error) {
        await rm(link, { force: true });
        throw error;
      }
      const currentName = basename(releaseDirectory);
      releaseDirectory = undefined;
      try {
        await pruneReleases(releasesRoot, currentName, previousName);
      } catch {
        /* successful release remains active */
      }
      return { status: "succeeded" };
    } catch (error) {
      return {
        status: "failed",
        ...normalizeBuildFailure(
          error instanceof SourceError
            ? error.reason
            : error instanceof StageError
              ? error.stage
              : "build_failed",
          error instanceof SourceError ? error.path : undefined,
        ),
      };
    } finally {
      if (workDirectory !== undefined) {
        try {
          await rm(workDirectory, { recursive: true, force: true });
        } catch {
          /* scratch cleanup can retry later */
        }
      }
      if (releaseDirectory !== undefined) {
        try {
          await rm(releaseDirectory, { recursive: true, force: true });
        } catch {
          /* unpublished release stays unserved */
        }
      }
    }
  }
}
