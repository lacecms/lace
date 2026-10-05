import { CliError, EXIT } from "./index.js";

export const preflightUsage =
  "Usage: lace cloudflare preflight --target cloudflare-remote --wrangler-auth token|oauth [--operator-env <path>] [--json]";
export interface PreflightOptions {
  readonly wranglerAuth: "token" | "oauth";
  readonly operatorEnv?: string;
  readonly json: boolean;
}
export function parsePreflightArguments(argv: readonly string[]): PreflightOptions {
  const values = new Map<string, string>();
  let json = false;
  const invalid = () => new CliError("USAGE", preflightUsage, EXIT.USAGE);
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (flag === "--json") {
      if (json) throw invalid();
      json = true;
    } else if (flag === "--target" || flag === "--wrangler-auth" || flag === "--operator-env") {
      const value = argv[++i];
      if (!value || value.startsWith("--") || values.has(flag)) throw invalid();
      values.set(flag, value);
    } else throw invalid();
  }
  const auth = values.get("--wrangler-auth");
  if (values.get("--target") !== "cloudflare-remote" || (auth !== "token" && auth !== "oauth"))
    throw invalid();
  const operatorEnv = values.get("--operator-env");
  return { wranglerAuth: auth, json, ...(operatorEnv === undefined ? {} : { operatorEnv }) };
}
