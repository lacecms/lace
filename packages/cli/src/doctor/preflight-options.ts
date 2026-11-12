import { parseFlags } from "../shared/parse-flags.js";
import { CliError, EXIT } from "../shared/cli.js";

export const preflightUsage =
  "Usage: lace cloudflare preflight --target cloudflare-remote --wrangler-auth token|oauth [--operator-env <path>] [--json]";
export interface PreflightOptions {
  readonly wranglerAuth: "token" | "oauth";
  readonly operatorEnv?: string;
  readonly json: boolean;
}
export function parsePreflightArguments(argv: readonly string[]): PreflightOptions {
  const { values, seen } = parseFlags(argv, {
    boolean: ["--json"],
    value: ["--target", "--wrangler-auth", "--operator-env"],
    allowWhitespaceValue: true,
    invalid: () => {
      throw new CliError("USAGE", preflightUsage, EXIT.USAGE);
    },
  });
  const json = seen.has("--json");
  const invalid = () => new CliError("USAGE", preflightUsage, EXIT.USAGE);
  const auth = values.get("--wrangler-auth");
  if (values.get("--target") !== "cloudflare-remote" || (auth !== "token" && auth !== "oauth"))
    throw invalid();
  const operatorEnv = values.get("--operator-env");
  return { wranglerAuth: auth, json, ...(operatorEnv === undefined ? {} : { operatorEnv }) };
}
