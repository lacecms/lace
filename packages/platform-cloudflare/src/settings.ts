import { siteBuildTrackingPolicy } from "@lacecms/domain";
import { parseBuildSiteIdentity, type LaceAppInput } from "@lacecms/server";
import type { KVNamespace } from "./cache.js";
import { DEFAULT_DEPLOY_HOOK_TIMEOUT_MS } from "./deploy-hook.js";
import type { D1Database } from "./d1.js";
import { DEFAULT_PAGES_API_BASE_URL } from "./pages-deployments.js";
import { DEFAULT_R2_TIMEOUT_MS, type R2Bucket } from "./r2-storage.js";

/** Structural subset of the Workers static-assets binding. */
export interface AssetsFetcher {
  fetch(request: Request): Promise<Response>;
}

/** Bindings, plain variables, and secrets the Worker reads from `env`. */
export interface CloudflareWorkerEnv {
  readonly LACE_BUILD_SITE_ID?: unknown;
  readonly LACE_BUILD_SITE_LABEL?: unknown;
  readonly ASSETS?: unknown;
  readonly CACHE?: unknown;
  readonly DB?: unknown;
  readonly LACE_AUTH_SECRET?: unknown;
  readonly LACE_DEPLOY_HOOK_TIMEOUT_MS?: unknown;
  readonly LACE_DEPLOY_HOOK_URL?: unknown;
  readonly LACE_ENVIRONMENT?: unknown;
  readonly LACE_PAGES_ACCOUNT_ID?: unknown;
  readonly LACE_PAGES_API_BASE_URL?: unknown;
  readonly LACE_PAGES_API_TOKEN?: unknown;
  readonly LACE_PAGES_PROJECT_NAME?: unknown;
  readonly LACE_PAGES_TRACKING_TIMEOUT_MINUTES?: unknown;
  readonly LACE_PUBLIC_BASE_URL?: unknown;
  readonly LACE_R2_TIMEOUT_MS?: unknown;
  readonly MEDIA?: unknown;
}

export interface CloudflareEnvironmentIssue {
  readonly reason: "invalid" | "missing";
  readonly variable: string;
}

/** Validation failures name bindings or variables but never repeat their values. */
export class CloudflareEnvironmentError extends Error {
  public constructor(readonly issues: readonly CloudflareEnvironmentIssue[]) {
    super(`Invalid Cloudflare environment: ${issues.map((issue) => issue.variable).join(", ")}.`);
    this.name = "CloudflareEnvironmentError";
  }
}

/** Optional Cloudflare Pages deployment tracking with a Pages-Read-only token. */
export interface PagesTrackingSettings {
  readonly accountId: string;
  readonly apiBaseUrl: URL;
  readonly apiToken: string;
  readonly projectName: string;
  readonly timeoutMs: number;
}

export interface CloudflareSettings {
  readonly buildSite?: LaceAppInput["buildSite"];
  readonly assets?: AssetsFetcher;
  readonly authSecret: string;
  readonly cache?: KVNamespace;
  readonly database: D1Database;
  readonly deployHookTimeoutMs: number;
  readonly deployHookUrl?: URL;
  readonly media: R2Bucket;
  readonly pagesTracking?: PagesTrackingSettings;
  readonly production: boolean;
  readonly publicBaseUrl: URL;
  readonly storageTimeoutMs: number;
}

function hasMethods(value: unknown, methods: readonly string[]): boolean {
  if (value === null || (typeof value !== "object" && typeof value !== "function")) return false;
  const record = value as Record<string, unknown>;
  return methods.every((method) => typeof record[method] === "function");
}

function binding<Value>(
  value: unknown,
  variable: string,
  methods: readonly string[],
  issues: CloudflareEnvironmentIssue[],
  optional = false,
): Value | undefined {
  if (value === undefined || value === null) {
    if (!optional) issues.push({ reason: "missing", variable });
    return undefined;
  }
  if (!hasMethods(value, methods)) {
    issues.push({ reason: "invalid", variable });
    return undefined;
  }
  return value as Value;
}

function text(
  value: unknown,
  variable: string,
  issues: CloudflareEnvironmentIssue[],
  optional = false,
): string | undefined {
  if (value === undefined || value === null || value === "") {
    if (!optional) issues.push({ reason: "missing", variable });
    return undefined;
  }
  if (typeof value !== "string" || value.trim().length === 0) {
    issues.push({ reason: "invalid", variable });
    return undefined;
  }
  return value;
}

function publicUrl(
  value: string | undefined,
  variable: string,
  issues: CloudflareEnvironmentIssue[],
): URL | undefined {
  if (value === undefined) return undefined;
  try {
    const parsed = new URL(value);
    const canonicalPath = parsed.pathname === "/" || parsed.pathname.endsWith("/");
    if (
      (parsed.protocol !== "http:" && parsed.protocol !== "https:") ||
      parsed.username.length > 0 ||
      parsed.password.length > 0 ||
      parsed.search.length > 0 ||
      parsed.hash.length > 0 ||
      !canonicalPath ||
      parsed.pathname.includes("//")
    ) {
      issues.push({ reason: "invalid", variable });
      return undefined;
    }
    return parsed;
  } catch {
    issues.push({ reason: "invalid", variable });
    return undefined;
  }
}

function hookUrl(
  value: string | undefined,
  variable: string,
  issues: CloudflareEnvironmentIssue[],
): URL | undefined {
  if (value === undefined) return undefined;
  try {
    const parsed = new URL(value);
    if (
      parsed.protocol !== "https:" ||
      parsed.username.length > 0 ||
      parsed.password.length > 0 ||
      parsed.hash.length > 0
    ) {
      issues.push({ reason: "invalid", variable });
      return undefined;
    }
    return parsed;
  } catch {
    issues.push({ reason: "invalid", variable });
    return undefined;
  }
}

/** An optional whole-millisecond timeout from 1 to 60000. */
function timeout(
  value: unknown,
  variable: string,
  fallback: number,
  issues: CloudflareEnvironmentIssue[],
): number {
  const raw = text(value, variable, issues, true);
  const parsed = raw === undefined ? fallback : Number(raw);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > 60_000)
    issues.push({ reason: "invalid", variable });
  return parsed;
}

const PAGES_ACCOUNT_ID_PATTERN = /^[0-9a-f]{32}$/u;
const PAGES_PROJECT_NAME_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,56}[a-z0-9])?$/u;
const PAGES_API_TOKEN_PATTERN = /^\S{1,512}$/u;

function matching(
  value: string | undefined,
  variable: string,
  pattern: RegExp,
  issues: CloudflareEnvironmentIssue[],
): string | undefined {
  if (value === undefined) return undefined;
  if (pattern.test(value)) return value;
  issues.push({ reason: "invalid", variable });
  return undefined;
}

/** A development-only stub origin: HTTPS, or HTTP on a loopback host. */
function pagesApiBaseUrl(
  value: string | undefined,
  production: boolean,
  issues: CloudflareEnvironmentIssue[],
): URL {
  const variable = "LACE_PAGES_API_BASE_URL";
  const fallback = new URL(DEFAULT_PAGES_API_BASE_URL);
  if (value === undefined) return fallback;
  try {
    const parsed = new URL(value);
    const loopback = ["127.0.0.1", "localhost", "[::1]"].includes(parsed.hostname);
    if (
      !production &&
      (parsed.protocol === "https:" || (parsed.protocol === "http:" && loopback)) &&
      parsed.username.length === 0 &&
      parsed.password.length === 0 &&
      parsed.search.length === 0 &&
      parsed.hash.length === 0 &&
      parsed.pathname.endsWith("/")
    )
      return parsed;
  } catch {
    /* reported below */
  }
  issues.push({ reason: "invalid", variable });
  return fallback;
}

/** All three identity settings or none; the timeout is whole minutes within policy. */
function pagesTracking(
  env: CloudflareWorkerEnv,
  production: boolean,
  issues: CloudflareEnvironmentIssue[],
): PagesTrackingSettings | undefined {
  const raw = {
    LACE_PAGES_ACCOUNT_ID: text(env.LACE_PAGES_ACCOUNT_ID, "LACE_PAGES_ACCOUNT_ID", issues, true),
    LACE_PAGES_API_TOKEN: text(env.LACE_PAGES_API_TOKEN, "LACE_PAGES_API_TOKEN", issues, true),
    LACE_PAGES_PROJECT_NAME: text(
      env.LACE_PAGES_PROJECT_NAME,
      "LACE_PAGES_PROJECT_NAME",
      issues,
      true,
    ),
  };
  const accountId = matching(
    raw.LACE_PAGES_ACCOUNT_ID,
    "LACE_PAGES_ACCOUNT_ID",
    PAGES_ACCOUNT_ID_PATTERN,
    issues,
  );
  const projectName = matching(
    raw.LACE_PAGES_PROJECT_NAME,
    "LACE_PAGES_PROJECT_NAME",
    PAGES_PROJECT_NAME_PATTERN,
    issues,
  );
  const apiToken = matching(
    raw.LACE_PAGES_API_TOKEN,
    "LACE_PAGES_API_TOKEN",
    PAGES_API_TOKEN_PATTERN,
    issues,
  );
  const minutesText = text(
    env.LACE_PAGES_TRACKING_TIMEOUT_MINUTES,
    "LACE_PAGES_TRACKING_TIMEOUT_MINUTES",
    issues,
    true,
  );
  const minutes =
    minutesText === undefined ? siteBuildTrackingPolicy.defaultTimeoutMinutes : Number(minutesText);
  if (
    !Number.isSafeInteger(minutes) ||
    minutes < siteBuildTrackingPolicy.minTimeoutMinutes ||
    minutes > siteBuildTrackingPolicy.maxTimeoutMinutes
  )
    issues.push({ reason: "invalid", variable: "LACE_PAGES_TRACKING_TIMEOUT_MINUTES" });
  const apiBaseUrl = pagesApiBaseUrl(
    text(env.LACE_PAGES_API_BASE_URL, "LACE_PAGES_API_BASE_URL", issues, true),
    production,
    issues,
  );
  const present = Object.entries(raw).filter(([, value]) => value !== undefined);
  if (present.length === 0) return undefined;
  for (const [variable, value] of Object.entries(raw))
    if (value === undefined && !issues.some((issue) => issue.variable === variable))
      issues.push({ reason: "missing", variable });
  if (accountId === undefined || projectName === undefined || apiToken === undefined)
    return undefined;
  return Object.freeze({
    accountId,
    apiBaseUrl,
    apiToken,
    projectName,
    timeoutMs: minutes * 60_000,
  });
}

/** Parses Worker bindings and secrets once, without exposing supplied values in errors. */
export function parseCloudflareSettings(env: CloudflareWorkerEnv): CloudflareSettings {
  const issues: CloudflareEnvironmentIssue[] = [];
  const buildSite = parseBuildSiteIdentity(env);
  const database = binding<D1Database>(env.DB, "DB", ["batch", "prepare"], issues);
  const media = binding<R2Bucket>(env.MEDIA, "MEDIA", ["delete", "get", "head", "put"], issues);
  const cache = binding<KVNamespace>(env.CACHE, "CACHE", ["delete", "get", "put"], issues, true);
  const assets = binding<AssetsFetcher>(env.ASSETS, "ASSETS", ["fetch"], issues, true);
  const authSecret = text(env.LACE_AUTH_SECRET, "LACE_AUTH_SECRET", issues);
  const publicBaseUrl = publicUrl(
    text(env.LACE_PUBLIC_BASE_URL, "LACE_PUBLIC_BASE_URL", issues),
    "LACE_PUBLIC_BASE_URL",
    issues,
  );
  const deployHookUrl = hookUrl(
    text(env.LACE_DEPLOY_HOOK_URL, "LACE_DEPLOY_HOOK_URL", issues, true),
    "LACE_DEPLOY_HOOK_URL",
    issues,
  );
  const mode = text(env.LACE_ENVIRONMENT, "LACE_ENVIRONMENT", issues, true) ?? "production";
  if (mode !== "production" && mode !== "development")
    issues.push({ reason: "invalid", variable: "LACE_ENVIRONMENT" });
  const tracking = pagesTracking(env, mode !== "development", issues);
  const storageTimeoutMs = timeout(
    env.LACE_R2_TIMEOUT_MS,
    "LACE_R2_TIMEOUT_MS",
    DEFAULT_R2_TIMEOUT_MS,
    issues,
  );
  const deployHookTimeoutMs = timeout(
    env.LACE_DEPLOY_HOOK_TIMEOUT_MS,
    "LACE_DEPLOY_HOOK_TIMEOUT_MS",
    DEFAULT_DEPLOY_HOOK_TIMEOUT_MS,
    issues,
  );
  if (
    issues.length > 0 ||
    database === undefined ||
    media === undefined ||
    authSecret === undefined ||
    publicBaseUrl === undefined
  ) {
    throw new CloudflareEnvironmentError(Object.freeze(issues));
  }
  return Object.freeze({
    buildSite,
    ...(assets === undefined ? {} : { assets }),
    authSecret,
    ...(cache === undefined ? {} : { cache }),
    database,
    deployHookTimeoutMs,
    ...(deployHookUrl === undefined ? {} : { deployHookUrl }),
    media,
    ...(tracking === undefined ? {} : { pagesTracking: tracking }),
    production: mode !== "development",
    publicBaseUrl,
    storageTimeoutMs,
  });
}
