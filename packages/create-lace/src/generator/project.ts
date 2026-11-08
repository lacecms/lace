import { createHash, randomUUID } from "node:crypto";
import {
  cp,
  lstat,
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validateExistingSite } from "../site/existing.js";
import { siteRecord } from "../site/modes.js";
import type { SiteRecord, SiteSelection } from "../site/modes.js";
import { TEMPLATE_FILES, TEMPLATE_VERSION } from "../template/inventory.js";
import { renderForSite } from "../template/render.js";

const ALLOWED_EXISTING = new Set([".git", "README.md", "LICENSE"]);
const TEMPLATE_ROOT = fileURLToPath(new URL("../../templates/", import.meta.url));

export interface GenerateOptions {
  readonly target: string;
  readonly cloudflare?: boolean;
  /** Site mode; defaults to the starter. */
  readonly site?: SiteSelection;
  /** Used by tests to inject a failure after moving an existing target aside. */
  readonly afterBackup?: () => Promise<void>;
  /** Used by tests to inject a failure while the original target is still in place. */
  readonly beforePublish?: () => Promise<void>;
}

export interface GeneratedProject {
  readonly path: string;
  readonly manifest: ProjectManifest;
  readonly readmePreserved: boolean;
  readonly cloudflare: boolean;
  readonly warning?: string;
}

export interface ProjectManifest {
  readonly schemaVersion: 1;
  readonly templateVersion: string;
  readonly site: SiteRecord;
  readonly files: Readonly<
    Record<
      string,
      { readonly owner: "user" } | { readonly owner: "managed"; readonly sha256: string }
    >
  >;
}

export class GeneratorError extends Error {
  public constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "GeneratorError";
  }
}

async function maybeStat(path: string): Promise<Awaited<ReturnType<typeof lstat>> | undefined> {
  try {
    return await lstat(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

async function validateTarget(
  target: string,
): Promise<{ path: string; entries: string[]; exists: boolean }> {
  const path = resolve(target);
  const parent = await maybeStat(dirname(path));
  if (parent === undefined || !parent.isDirectory()) {
    throw new GeneratorError(`Parent directory does not exist: ${dirname(path)}`);
  }
  const stat = await maybeStat(path);
  if (stat === undefined) return { path, entries: [], exists: false };
  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    throw new GeneratorError(`Target must be a regular directory: ${path}`);
  }
  const entries = await readdir(path);
  for (const entry of entries) {
    if (!ALLOWED_EXISTING.has(entry)) {
      throw new GeneratorError(`Target contains unsupported entry: ${entry}`);
    }
    const entryStat = await lstat(join(path, entry));
    if (entryStat.isSymbolicLink()) {
      throw new GeneratorError(`Allowed entry must not be a symbolic link: ${entry}`);
    }
    if (entry === ".git" ? !entryStat.isDirectory() && !entryStat.isFile() : !entryStat.isFile()) {
      throw new GeneratorError(`Allowed entry has an unsupported type: ${entry}`);
    }
  }
  return { path, entries, exists: true };
}

function packageName(target: string): string {
  const normalized = basename(target)
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-|-$/gu, "");
  if (normalized.length === 0) return "lace-site";
  return /^[a-z]/u.test(normalized) ? normalized : `lace-${normalized}`;
}

function renderTemplate(
  bytes: Buffer,
  file: (typeof TEMPLATE_FILES)[number],
  name: string,
  site: SiteSelection,
  cloudflare: boolean,
): Buffer {
  if (file.interpolateName !== true && file.render === undefined) return bytes;
  let text = bytes.toString("utf8");
  if (file.interpolateName === true) text = text.replaceAll("{{PROJECT_NAME}}", name);
  if (file.render !== undefined)
    text = renderForSite(text, file.path, file.render, site, cloudflare);
  return Buffer.from(text, "utf8");
}

/** Rejects invalid site selections before anything is written. */
async function resolveSite(target: string, site: SiteSelection): Promise<SiteSelection> {
  if (site.mode !== "existing") return site;
  try {
    return { mode: "existing", path: await validateExistingSite(target, site.path) };
  } catch (error) {
    throw new GeneratorError(errorMessage(error), { cause: error });
  }
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Generate in a sibling directory, then publish the completed tree. */
export async function generateProject(options: GenerateOptions): Promise<GeneratedProject> {
  const { path: target, entries, exists } = await validateTarget(options.target);
  const site = await resolveSite(target, options.site ?? { mode: "starter" });
  const readmePreserved = entries.includes("README.md");
  const stage = await mkdtemp(join(dirname(target), `.${basename(target)}.lace-stage-`));
  let backup: string | undefined;
  let published = false;
  let stageExists = true;
  try {
    for (const entry of entries) {
      await cp(join(target, entry), join(stage, entry), { recursive: true, dereference: false });
    }
    const files: Record<string, { owner: "user" } | { owner: "managed"; sha256: string }> = {};
    for (const file of TEMPLATE_FILES) {
      if (file.cloudflare && !options.cloudflare) continue;
      if (file.modes !== undefined && !file.modes.includes(site.mode)) continue;
      if (file.path === "README.md" && readmePreserved) {
        files[file.path] = { owner: "user" };
        continue;
      }
      const bytes = renderTemplate(
        await readFile(join(TEMPLATE_ROOT, file.path)),
        file,
        packageName(target),
        site,
        options.cloudflare === true,
      );
      const output = join(stage, file.path);
      await mkdir(dirname(output), { recursive: true });
      await writeFile(output, bytes, { flag: "wx" });
      if (file.metadata) continue;
      files[file.path] =
        file.owner === "managed"
          ? { owner: "managed", sha256: createHash("sha256").update(bytes).digest("hex") }
          : { owner: "user" };
    }
    const manifest: ProjectManifest = {
      schemaVersion: 1,
      templateVersion: TEMPLATE_VERSION,
      site: siteRecord(site),
      files: Object.fromEntries(
        Object.entries(files).sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0)),
      ),
    };
    await mkdir(join(stage, ".lace"), { recursive: true });
    await writeFile(join(stage, ".lace/manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, {
      flag: "wx",
    });
    await options.beforePublish?.();

    // Recheck immediately before publication in case another process changed the target.
    const current = await validateTarget(target);
    if (current.exists !== exists || current.entries.join("\0") !== entries.join("\0")) {
      throw new GeneratorError("Target changed while generation was in progress.");
    }
    if (exists) {
      backup = join(dirname(target), `.${basename(target)}.lace-backup-${randomUUID()}`);
      await rename(target, backup);
      await options.afterBackup?.();
    }
    await rename(stage, target);
    stageExists = false;
    published = true;
    if (backup !== undefined) {
      try {
        await rm(backup, { recursive: true });
      } catch (cleanupError) {
        return {
          path: target,
          manifest,
          readmePreserved,
          cloudflare: options.cloudflare === true,
          warning: `Project was created, but the original backup remains at ${backup}. Inspect it before removal. Cleanup error: ${errorMessage(cleanupError)}`,
        };
      }
      backup = undefined;
    }
    return { path: target, manifest, readmePreserved, cloudflare: options.cloudflare === true };
  } catch (error) {
    const recover: string[] = [];
    if (!published && backup !== undefined) {
      try {
        await rename(backup, target);
        backup = undefined;
      } catch (restoreError) {
        recover.push(
          `Original project remains at ${backup}; move it back to ${target}. Restore error: ${errorMessage(restoreError)}`,
        );
      }
    }
    if (stageExists) {
      try {
        await rm(stage, { recursive: true, force: true });
      } catch (cleanupError) {
        recover.push(
          `Staging directory remains at ${stage}; remove it after inspection. Cleanup error: ${errorMessage(cleanupError)}`,
        );
      }
    }
    if (backup !== undefined && published) {
      recover.push(
        `Original project backup remains at ${backup}; inspect and remove it when safe.`,
      );
    }
    throw new GeneratorError(
      `Generation failed: ${errorMessage(error)}${recover.length ? `\n${recover.join("\n")}` : ""}`,
      { cause: error },
    );
  }
}
