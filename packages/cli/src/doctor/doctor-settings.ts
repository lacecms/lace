import { resolve } from "node:path";
import type { DoctorOptions } from "./doctor-report.js";

export type Values = Readonly<Record<string, string | undefined>>;
export function apiUrl(value: string | undefined, local = false): URL | undefined {
  try {
    if (!value) return undefined;
    const url = new URL(value);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname.includes("//") ||
      !url.pathname.endsWith("/")
    )
      return undefined;
    if (local && !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) return undefined;
    return url;
  } catch {
    return undefined;
  }
}

export async function invalidSettings(
  options: DoctorOptions,
  values: Values,
  cwd: string,
): Promise<string[]> {
  const invalid = new Set<string>();
  const require = (name: string) => {
    if (!values[name]?.trim()) invalid.add(name);
  };
  require("LACE_API_BASE_URL");
  if (!apiUrl(values.LACE_API_BASE_URL, options.target === "cloudflare-local"))
    invalid.add("LACE_API_BASE_URL");
  if (options.target !== "node") {
    for (const name of options.target === "cloudflare-local"
      ? ["LACE_D1_DATABASE_ID", "LACE_CLOUDFLARE_PERSIST_TO", "LACE_WRANGLER_CONFIG"]
      : [
          "CLOUDFLARE_ACCOUNT_ID",
          "CLOUDFLARE_API_TOKEN",
          "LACE_D1_DATABASE_ID",
          "LACE_WRANGLER_CONFIG",
        ])
      require(name);
    if (values.LACE_D1_DATABASE_ID && !/^[a-zA-Z0-9_-]+$/u.test(values.LACE_D1_DATABASE_ID))
      invalid.add("LACE_D1_DATABASE_ID");
    if (
      options.target === "cloudflare-remote" &&
      values.CLOUDFLARE_ACCOUNT_ID &&
      !/^[a-zA-Z0-9_-]+$/u.test(values.CLOUDFLARE_ACCOUNT_ID)
    )
      invalid.add("CLOUDFLARE_ACCOUNT_ID");
  } else if (options.mode === "native") {
    const { parseNodeRuntimeSettings, NodeEnvironmentError } =
      await import("@lacecms/platform-node");
    try {
      parseNodeRuntimeSettings(values);
    } catch (error) {
      if (!(error instanceof NodeEnvironmentError)) throw error;
      for (const issue of error.issues) invalid.add(issue.variable);
    }
    if (values.LACE_DATABASE_PATH === ":memory:") invalid.add("LACE_DATABASE_PATH");
  } else {
    for (const name of [
      "LACE_DATABASE_PATH",
      "LACE_PUBLIC_BASE_URL",
      "LACE_AUTH_SECRET",
      "LACE_MINIO_ROOT_ACCESS_KEY",
      "LACE_MINIO_ROOT_SECRET",
      "LACE_BUILDER_SECRET",
      "LACE_API_IMAGE",
      "LACE_BUILDER_IMAGE",
    ])
      require(name);
    // Validate generated host inputs using the runtime's pure parser, with the
    // same translation/defaults as the generated Compose file.
    const { parseNodeRuntimeSettings, NodeEnvironmentError } =
      await import("@lacecms/platform-node");
    const mapped = {
      ...values,
      LACE_DATABASE_PATH: "/data/lace.sqlite",
      LACE_PORT: values.LACE_API_PORT ?? "3000",
      LACE_HOST: "0.0.0.0",
      LACE_MINIO_ACCESS_KEY: values.LACE_MINIO_ROOT_ACCESS_KEY,
      LACE_MINIO_SECRET_KEY: values.LACE_MINIO_ROOT_SECRET,
      LACE_MINIO_BUCKET: values.LACE_MINIO_BUCKET ?? "lace-media",
      LACE_MINIO_REGION: values.LACE_MINIO_REGION ?? "us-east-1",
      LACE_MINIO_TIMEOUT_MS: values.LACE_MINIO_TIMEOUT_MS ?? "5000",
      LACE_MINIO_ENDPOINT: "http://minio:9000",
      LACE_BUILDER_URL: "http://builder:8788/",
      // The published API image runs with NODE_ENV=production.
      NODE_ENV: "production",
    };
    try {
      parseNodeRuntimeSettings(mapped);
    } catch (error) {
      if (!(error instanceof NodeEnvironmentError)) throw error;
      const names: Record<string, string> = {
        LACE_PORT: "LACE_API_PORT",
        LACE_MINIO_ACCESS_KEY: "LACE_MINIO_ROOT_ACCESS_KEY",
        LACE_MINIO_SECRET_KEY: "LACE_MINIO_ROOT_SECRET",
      };
      for (const issue of error.issues) invalid.add(names[issue.variable] ?? issue.variable);
    }
    const httpPort = Number(values.LACE_HTTP_PORT ?? "8080");
    if (!Number.isInteger(httpPort) || httpPort < 1 || httpPort > 65535)
      invalid.add("LACE_HTTP_PORT");
    if (
      !values.LACE_DATABASE_PATH ||
      resolve(cwd, values.LACE_DATABASE_PATH) !== resolve(cwd, ".lace/data/lace.sqlite")
    )
      invalid.add("LACE_DATABASE_PATH");
  }
  return [...invalid].sort();
}

/**
 * The configured email provider for the `node` target, using the runtime's
 * rules without contacting any mail server. Undefined when not applicable or
 * when the settings are invalid (the settings check names them).
 */
export async function emailProvider(
  options: DoctorOptions,
  values: Values,
): Promise<string | undefined> {
  if (options.target !== "node") return undefined;
  const { parseNodeEmailSettings } = await import("@lacecms/platform-node");
  const result = parseNodeEmailSettings(
    options.mode === "compose" ? { ...values, NODE_ENV: "production" } : values,
  );
  return result.settings?.provider;
}
