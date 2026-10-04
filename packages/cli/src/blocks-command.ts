import { mkdir, unlink } from "node:fs/promises";
import { dirname, join } from "node:path";
import { BlockError, loadRegistry } from "./blocks-registry.js";
import type { Registry } from "./blocks-registry.js";
import { planBlocks, decisionWritable } from "./blocks-plan.js";
import type { BlockPlan, FileDecision } from "./blocks-plan.js";
import { loadConfiguredBlocks, readSiteFile, selectSite } from "./blocks-site.js";
import { failureDiagnostic, diagnosticText } from "./diagnostics.js";
import { EXIT } from "./index.js";
import { atomicWrite, inspectDirectory } from "./upgrade-files.js";
import { upgradeHash, UpgradeError } from "./upgrade-input.js";

export const addBlockUsage =
  "Usage: lace add block <type...>|--all [--site <dir>] [--framework astro] [--dry-run] [--write-new] [--json]\nInstalls registry block components into the site (default: site), regenerates its block map and records them in lace.site.json. Edited files are never overwritten.";

export interface AddBlockOptions {
  readonly types: readonly string[];
  readonly all: boolean;
  readonly site: string;
  readonly framework: string | undefined;
  readonly dryRun: boolean;
  readonly writeNew: boolean;
  readonly json: boolean;
}

function usage(): never {
  throw new BlockError("BLOCK_USAGE", addBlockUsage);
}

/** argv excludes the leading `add block` words. */
export function parseAddBlockArguments(argv: readonly string[]): AddBlockOptions {
  const types: string[] = [];
  const seen = new Set<string>();
  let site = "site";
  let framework: string | undefined;
  let all = false;
  let dryRun = false;
  let writeNew = false;
  let json = false;
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index]!;
    if (!item.startsWith("--")) {
      if (!/^[A-Za-z][A-Za-z0-9-]{0,63}$/u.test(item)) usage();
      types.push(item);
      continue;
    }
    if (seen.has(item)) usage();
    seen.add(item);
    if (item === "--all") all = true;
    else if (item === "--dry-run") dryRun = true;
    else if (item === "--write-new") writeNew = true;
    else if (item === "--json") json = true;
    else if (item === "--site" || item === "--framework") {
      const value = argv[++index];
      if (value === undefined || value.trim().length === 0 || value.startsWith("--")) usage();
      if (item === "--site") site = value;
      else framework = value;
    } else usage();
  }
  if (all === types.length > 0) usage();
  return { types, all, site, framework, dryRun, writeNew, json };
}

function fileChanged(path: string): never {
  throw new BlockError(
    "BLOCK_INPUT",
    `${path} changed while lace add block was running or cannot be written safely; files written before it are recorded on the next run. Re-run the command.`,
  );
}

async function ensureDirectory(root: string, path: string): Promise<void> {
  const directory = dirname(join(root, path));
  try {
    await inspectDirectory(directory);
  } catch (error) {
    if (error instanceof UpgradeError) fileChanged(path);
    throw error;
  }
  await mkdir(directory, { recursive: true });
}

async function write(
  root: string,
  path: string,
  bytes: Buffer,
  expected: string | null | undefined,
) {
  await ensureDirectory(root, path);
  try {
    await atomicWrite(root, path, bytes, 0o644, expected);
  } catch (error) {
    if (error instanceof UpgradeError) fileChanged(path);
    throw error;
  }
}

async function remove(root: string, decision: FileDecision): Promise<void> {
  const current = await readSiteFile(root, decision.path);
  if (current === undefined || upgradeHash(current) !== decision.currentHash)
    fileChanged(decision.path);
  await unlink(join(root, decision.path));
}

async function applyPlan(root: string, plan: BlockPlan, writeNew: boolean): Promise<string[]> {
  const written: string[] = [];
  for (const decision of plan.files) {
    if (decision.action === "conflict") continue;
    if (!decisionWritable(decision, plan.items)) continue;
    if (decision.action === "remove") {
      await remove(root, decision);
      written.push(decision.path);
    } else if (decision.bytes !== undefined) {
      await write(root, decision.path, decision.bytes, decision.currentHash);
      written.push(decision.path);
    }
  }
  if (plan.blockMap.bytes !== undefined && plan.blockMap.action !== "conflict") {
    await write(root, plan.blockMap.path, plan.blockMap.bytes, plan.blockMap.currentHash);
    written.push(plan.blockMap.path);
  }
  if (plan.lock.action !== "current") {
    await write(root, plan.lock.path, plan.lock.bytes, plan.lock.currentHash);
    written.push(plan.lock.path);
  }
  if (writeNew)
    for (const decision of [...plan.files, plan.blockMap])
      if (decision.action === "conflict" && decision.targetBytes !== undefined) {
        const path = `${decision.path}.new`;
        const current = await readSiteFile(root, path);
        await write(
          root,
          path,
          decision.targetBytes,
          current === undefined ? null : upgradeHash(current),
        );
        written.push(path);
      }
  return written;
}

export interface AddBlockResult {
  readonly output: string;
  readonly exitCode: number;
}

function present(plan: BlockPlan, options: AddBlockOptions, written: readonly string[]): string {
  const counts = (status: string) => plan.items.filter((item) => item.status === status).length;
  const lines = [
    `${options.dryRun ? "Block dry run" : "Blocks"} for ${plan.framework} site ${plan.site}: ${counts("added")} added, ${counts("updated")} updated, ${counts("scaffolded")} scaffolded, ${counts("current")} current, ${plan.conflicts} conflict(s).${options.dryRun ? " No files written." : ""}`,
  ];
  for (const item of plan.items) {
    lines.push(
      `${item.status} ${item.name}${item.revision === null ? " (custom)" : ` (revision ${item.revision})`}${item.reason === undefined ? "" : `: ${item.reason}`}`,
    );
    for (const decision of plan.files.filter((file) => file.item === item.name)) {
      lines.push(`  ${decision.action} ${decision.path}: ${decision.reason}`);
      if (decision.action === "conflict" && decision.diff !== null)
        lines.push(
          ...decision.diff
            .trimEnd()
            .split("\n")
            .map((line) => `    ${line}`),
        );
    }
  }
  lines.push(`block map ${plan.blockMap.path}: ${plan.blockMap.action} (${plan.blockMap.reason})`);
  if (plan.blockMap.action === "conflict") {
    if (plan.blockMap.entriesToAdd.length > 0)
      lines.push(
        "  The block map was edited and is not rewritten. Add these lines to it:",
        ...plan.blockMap.entriesToAdd.map((line) => `    ${line}`),
      );
    else
      lines.push(
        "  The block map was edited and is not rewritten; it already registers every block.",
      );
  }
  lines.push(`lock ${plan.lock.path}: ${plan.lock.action}`);
  if (!plan.configChecked)
    lines.push(
      "Block definition versions not checked: no lace.config.ts in the working directory.",
    );
  for (const mismatch of plan.versionMismatches)
    lines.push(
      `Version mismatch: ${mismatch.blockType} is version ${mismatch.configVersion} in lace.config.ts but the registry component targets version ${mismatch.registryVersion}; it was not installed. Use a matching @lacecms/cli release or write the component yourself.`,
    );
  for (const missing of plan.missingRenderers)
    lines.push(
      `No renderer for ${missing.blockType}: ${missing.reason}, then run lace add block ${missing.blockType}.`,
    );
  if (plan.packages.command !== null)
    lines.push(
      `Missing or incompatible site packages (${plan.packages.missing.map((entry) => `${entry.name} ${entry.installed ?? "absent"}, needs ${entry.range}`).join("; ")}). Install them:`,
      `  ${plan.packages.command}`,
    );
  if (options.writeNew && written.some((path) => path.endsWith(".new")))
    lines.push(
      `Proposed registry bytes written next to conflicting files: ${written.filter((path) => path.endsWith(".new")).join(", ")}.`,
    );
  return lines.join("\n");
}

export async function runAddBlockCommand(
  argv: readonly string[],
  context: { readonly cwd?: string; readonly registry?: Registry } = {},
): Promise<AddBlockResult> {
  const options = parseAddBlockArguments(argv);
  const cwd = context.cwd ?? process.cwd();
  const registry = context.registry ?? (await loadRegistry());
  const site = await selectSite({ cwd, site: options.site, framework: options.framework });
  const configured = await loadConfiguredBlocks(cwd);
  const plan = await planBlocks({
    site,
    registry,
    types: options.types,
    all: options.all,
    configured,
  });
  const written = options.dryRun ? [] : await applyPlan(site.root, plan, options.writeNew);
  const code =
    plan.conflicts > 0
      ? "BLOCKS_CONFLICTS"
      : options.dryRun
        ? "BLOCKS_PLAN"
        : written.length > 0
          ? "BLOCKS_INSTALLED"
          : "BLOCKS_CURRENT";
  const exitCode = plan.conflicts > 0 ? EXIT.PENDING : EXIT.OK;
  const text = present(plan, options, written);
  const diagnostic = plan.conflicts > 0 ? failureDiagnostic("add block", code) : undefined;
  if (options.json) {
    const { lock, files, blockMap, ...rest } = plan;
    const strip = ({ bytes: _bytes, targetBytes: _target, ...decision }: FileDecision) => decision;
    return {
      output: JSON.stringify({
        ok: plan.conflicts === 0,
        code,
        message: text.split("\n")[0],
        data: {
          ...rest,
          dryRun: options.dryRun,
          files: files.map(strip),
          blockMap: { ...strip(blockMap), entriesToAdd: blockMap.entriesToAdd },
          lock: { path: lock.path, action: lock.action },
          written,
        },
        ...diagnostic,
      }),
      exitCode,
    };
  }
  return { output: diagnostic ? `${text}\n${diagnosticText(diagnostic)}` : text, exitCode };
}
