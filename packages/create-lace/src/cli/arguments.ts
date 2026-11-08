import type { SiteSelection } from "../site/modes.js";

export function usage(): string {
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

export function parseArguments(args: readonly string[]): ParsedArguments | undefined {
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
