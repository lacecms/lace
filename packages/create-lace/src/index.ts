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
import { TEMPLATE_FILES, TEMPLATE_VERSION } from "./inventory.js";
import { renderForSite } from "./render.js";
import {
  createPrompter,
  isAstroProject,
  promptSite,
  siteRecord,
  validateExistingSite,
} from "./site.js";
import type { SiteRecord, SiteSelection } from "./site.js";

export { TEMPLATE_FILES, TEMPLATE_VERSION } from "./inventory.js";
export {
  renderCloudflareMarkers,
  renderForSite,
  renderSiteMarkers,
  TemplateError,
} from "./render.js";
export { normalizeSitePath, SITE_MODES } from "./site.js";
export type { SiteMode, SiteRecord, SiteSelection } from "./site.js";

const ALLOWED_EXISTING = new Set([".git", "README.md", "LICENSE"]);
const TEMPLATE_ROOT = fileURLToPath(new URL("../templates/", import.meta.url));

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

function errorMessage(error: unknown): string {
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

function usage(): string {
  return [
    "Usage: create-lace [create] <dir> [site mode] [--cloudflare] | create-lace init . [site mode] [--cloudflare]",
    "Site mode (at most one): --starter | --existing-site <path> | --no-site.",
    "--cloudflare adds the CMS Worker in worker/ and, with a site, the static-site Pages workflow.",
    "Without a mode flag, a terminal asks for the mode; otherwise the starter is generated.",
  ].join("\n");
}

const FLAGS = new Set(["--cloudflare", "--starter", "--existing-site", "--no-site"]);

interface ParsedArguments {
  readonly command: "create" | "init";
  readonly directory: string;
  readonly cloudflare: boolean;
  readonly site: SiteSelection | undefined;
}

function parseArguments(args: readonly string[]): ParsedArguments | undefined {
  const normalized =
    args[0] !== undefined && args[0] !== "create" && args[0] !== "init" && !args[0].startsWith("-")
      ? ["create", ...args]
      : args;
  const command = normalized[0];
  const positional: string[] = [];
  const flags: string[] = [];
  let sitePath: string | undefined;
  for (let index = 1; index < normalized.length; index++) {
    const arg = normalized[index]!;
    if (!arg.startsWith("--")) positional.push(arg);
    else if (arg === "--existing-site") {
      const value = normalized[++index];
      if (value === undefined || value.startsWith("-")) return undefined;
      flags.push(arg);
      sitePath = value;
    } else flags.push(arg);
  }
  const modes = flags.filter((flag) => flag !== "--cloudflare");
  const cloudflare = flags.includes("--cloudflare");
  if (
    (command !== "create" && command !== "init") ||
    positional.length !== 1 ||
    flags.some((flag) => !FLAGS.has(flag)) ||
    flags.length !== new Set(flags).size ||
    modes.length > 1 ||
    (command === "init" && positional[0] !== ".")
  )
    return undefined;
  const site: SiteSelection | undefined =
    modes[0] === "--starter"
      ? { mode: "starter" }
      : modes[0] === "--no-site"
        ? { mode: "none" }
        : sitePath !== undefined
          ? { mode: "existing", path: sitePath }
          : undefined;
  return { command, directory: positional[0]!, cloudflare, site };
}

/** Terminal access for the interactive site-mode prompt. */
export interface CliTerminal {
  readonly input?: NodeJS.ReadableStream;
  /** Defaults to whether both standard input and output are terminals. */
  readonly interactive?: boolean;
}

async function detectAstroParent(target: string): Promise<boolean> {
  try {
    return await isAstroProject(dirname(target));
  } catch {
    return false;
  }
}

function nextSteps(project: GeneratedProject): string[] {
  const { site } = project.manifest;
  const guide = project.readmePreserved ? "docs/lace-operations.md" : "README.md";
  const lines =
    site.mode === "existing"
      ? [
          `Site mode: existing site at ${site.path} (the generator did not modify it).`,
          `Next: follow ${guide} for setup; after pnpm install, install @lacecms/astro and @lacecms/render in the site, run pnpm exec lace add block --all --site ${site.path} and follow docs/lace-astro-site.md.`,
        ]
      : site.mode === "none"
        ? [
            "Site mode: none (CMS only). No site is built; build requests fail until a site is configured.",
            `Next: follow ${guide} for setup; to connect an Astro site later, follow docs/lace-astro-site.md.`,
          ]
        : [
            "Site mode: starter (site/).",
            ...(project.readmePreserved
              ? []
              : [
                  "Next: follow README.md for setup, first admin and publication; see docs/lace-operations.md for detailed operation.",
                ]),
          ];
  if (project.cloudflare)
    lines.push(
      "Cloudflare: the CMS Worker is in worker/; follow the Cloudflare Worker section of docs/lace-operations.md (local: pnpm cf:env:prepare, cf:db:migrate, cf:content:sync, cf:auth:bootstrap, cf:dev).",
    );
  if (project.readmePreserved)
    lines.push(
      "Preserved existing README.md. Follow docs/lace-operations.md for Lace setup; manually copy relevant instructions into your README if desired.",
    );
  return lines;
}

/** CLI entry point. Returns a process exit code without terminating the caller. */
export async function runCli(
  args: readonly string[],
  cwd = process.cwd(),
  stdout: Pick<NodeJS.WriteStream, "write"> = process.stdout,
  stderr: Pick<NodeJS.WriteStream, "write"> = process.stderr,
  terminal: CliTerminal = {},
): Promise<number> {
  const parsed = parseArguments(args);
  if (parsed === undefined) {
    stderr.write(`${usage()}\n`);
    return 2;
  }
  const target = parsed.command === "init" ? cwd : resolve(cwd, parsed.directory);
  let site = parsed.site;
  if (site === undefined) {
    if (terminal.interactive ?? Boolean(process.stdin.isTTY && process.stdout.isTTY)) {
      const prompter = createPrompter(terminal.input ?? process.stdin, stdout);
      try {
        site = await promptSite(prompter, stdout, await detectAstroParent(target));
      } finally {
        prompter.close();
      }
      if (site === undefined) {
        stderr.write(`${usage()}\n`);
        return 2;
      }
    } else {
      site = { mode: "starter" };
      stdout.write(
        "No terminal: generating the starter site. Use --existing-site <path> to connect an existing Astro site or --no-site for the CMS only.\n",
      );
    }
  }
  try {
    const result = await generateProject({ target, cloudflare: parsed.cloudflare, site });
    stdout.write(`Created Lace project at ${result.path}\n`);
    stdout.write(`${nextSteps(result).join("\n")}\n`);
    if (result.warning !== undefined) stderr.write(`${result.warning}\n`);
    return 0;
  } catch (error) {
    stderr.write(`${errorMessage(error)}\n`);
    return 1;
  }
}
