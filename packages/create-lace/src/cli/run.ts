import { dirname, resolve } from "node:path";
import { errorMessage, generateProject } from "../generator/project.js";
import type { GeneratedProject } from "../generator/project.js";
import { isAstroProject } from "../site/existing.js";
import { parseArguments, usage } from "./arguments.js";
import { createPrompter, promptSite } from "./prompt.js";

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
  const start = project.readmePreserved
    ? "Next: follow docs/lace-compose-dev.md"
    : "Next: follow README.md to choose a guide, starting with docs/lace-compose-dev.md";
  const lines =
    site.mode === "existing"
      ? [
          `Site mode: existing site at ${site.path} (the generator did not modify it).`,
          `${start}; it connects the site: install @lacecms/astro and @lacecms/render in the site, run pnpm exec lace add block --all --site ${site.path} and follow docs/lace-astro-site.md.`,
        ]
      : site.mode === "none"
        ? [
            "Site mode: none (CMS only). No site is built; build requests fail until a site is configured.",
            `${start}; to connect an Astro site later, follow docs/lace-astro-site.md.`,
          ]
        : [
            "Site mode: starter (site/).",
            `${start} for setup, first admin, publication and the site build.`,
          ];
  lines.push(
    `Guides: docs/lace-compose-dev.md (development), docs/lace-compose-production.md (production)${project.cloudflare ? ", docs/lace-cloudflare.md (Cloudflare)" : ""}; reference: docs/lace-operations.md.`,
  );
  if (project.cloudflare)
    lines.push(
      "Cloudflare: the CMS Worker is in worker/; follow docs/lace-cloudflare.md, local first (pnpm cf:env:prepare, cf:db:migrate, cf:content:sync, cf:auth:bootstrap, cf:dev), then explicit account commands.",
    );
  if (project.readmePreserved)
    lines.push(
      "Preserved existing README.md. Follow the guides above for Lace setup and docs/lace-operations.md for reference; manually copy relevant instructions into your README if desired.",
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
