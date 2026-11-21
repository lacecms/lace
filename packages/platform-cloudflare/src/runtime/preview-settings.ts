import type { GitHubPreviewSettings } from "../deploy/preview-github.js";
import type { R2Bucket } from "../media/r2-storage.js";

export interface CloudflarePreviewEnv {
  readonly PREVIEW?: unknown;
  readonly LACE_PREVIEW_ORIGIN?: unknown;
  readonly LACE_PREVIEW_GITHUB_REPOSITORY?: unknown;
  readonly LACE_PREVIEW_GITHUB_REF?: unknown;
  readonly LACE_PREVIEW_GITHUB_WORKFLOW?: unknown;
  readonly LACE_PREVIEW_GITHUB_TOKEN?: unknown;
  readonly LACE_PREVIEW_RUNNER_SECRET?: unknown;
  readonly LACE_PREVIEW_SITE_PATH?: unknown;
}

export interface CloudflarePreviewSettings {
  readonly origin: URL;
  readonly siteUrl: string;
  readonly sitePath: string;
  readonly bootstrapSecret: string;
  readonly bucket: R2Bucket;
  readonly github: GitHubPreviewSettings;
}

type CloudflarePreviewVars = Pick<
  CloudflarePreviewEnv,
  | "LACE_PREVIEW_ORIGIN"
  | "LACE_PREVIEW_GITHUB_REPOSITORY"
  | "LACE_PREVIEW_GITHUB_REF"
  | "LACE_PREVIEW_GITHUB_WORKFLOW"
  | "LACE_PREVIEW_SITE_PATH"
> & { readonly LACE_BUILD_SITE_URL?: unknown };

function matches(value: unknown, pattern: RegExp): string | undefined {
  return typeof value === "string" && pattern.test(value) ? value : undefined;
}

export function previewHttpsUrl(value: unknown): URL | undefined {
  if (typeof value !== "string" || /[?#\\\s]/u.test(value)) return undefined;
  try {
    const url = new URL(value);
    if (url.protocol === "https:" && !url.username && !url.password) return url;
  } catch {
    return undefined;
  }
}

const secret = /^[\x21-\x7e]{32,256}(?![\s\S])/u;

/** Validate the non-secret configuration without requiring deployed credentials or bindings. */
export function parseCloudflarePreviewVars(env: CloudflarePreviewVars, admin: URL) {
  const origin = previewHttpsUrl(env.LACE_PREVIEW_ORIGIN);
  const site = previewHttpsUrl(env.LACE_BUILD_SITE_URL);
  const repository = matches(
    env.LACE_PREVIEW_GITHUB_REPOSITORY,
    /^[A-Za-z0-9][A-Za-z0-9-]{0,38}\/[A-Za-z0-9_-][A-Za-z0-9._-]{0,99}(?![\s\S])/u,
  );
  const ref = matches(
    env.LACE_PREVIEW_GITHUB_REF,
    /^(?!refs\/)(?!.*\.\.)[A-Za-z0-9_-][A-Za-z0-9_./-]{0,254}(?![\s\S])/u,
  );
  const workflow = matches(
    env.LACE_PREVIEW_GITHUB_WORKFLOW,
    /^[A-Za-z0-9_-][A-Za-z0-9_-]{0,99}\.ya?ml(?![\s\S])/u,
  );
  const sitePath = matches(
    env.LACE_PREVIEW_SITE_PATH,
    /^(?:\.|[A-Za-z0-9_-][A-Za-z0-9._-]*(?:\/[A-Za-z0-9_-][A-Za-z0-9._-]*)*)(?![\s\S])/u,
  );
  if (
    !origin ||
    origin.pathname !== "/" ||
    admin.pathname !== "/" ||
    admin.protocol !== "https:" ||
    origin.hostname === admin.hostname ||
    !site ||
    site.hostname === origin.hostname ||
    !repository ||
    !ref ||
    ref.split("/").some((part) => !part || part.endsWith(".") || part.endsWith(".lock")) ||
    !workflow ||
    !sitePath ||
    sitePath.length > 256
  )
    return undefined;
  return { origin, siteUrl: site.href, sitePath, repository, ref, workflow };
}

/** Optional preview settings fail closed without interrupting existing publication. */
export function parseCloudflarePreviewSettings(
  env: CloudflarePreviewEnv &
    CloudflarePreviewVars & {
      readonly MEDIA?: unknown;
      readonly LACE_AUTH_SECRET?: unknown;
      readonly LACE_PAGES_API_TOKEN?: unknown;
    },
  admin: URL,
): CloudflarePreviewSettings | undefined {
  const vars = parseCloudflarePreviewVars(env, admin);
  const token = matches(env.LACE_PREVIEW_GITHUB_TOKEN, secret);
  const bootstrapSecret = matches(env.LACE_PREVIEW_RUNNER_SECRET, secret);
  const bucket = env.PREVIEW as (Partial<R2Bucket> & { readonly list?: unknown }) | undefined;
  if (
    !vars ||
    !token ||
    !bootstrapSecret ||
    token === bootstrapSecret ||
    [env.LACE_AUTH_SECRET, env.LACE_PAGES_API_TOKEN].some(
      (value) => value === token || value === bootstrapSecret,
    ) ||
    !bucket ||
    bucket === env.MEDIA ||
    ![bucket.get, bucket.put, bucket.head, bucket.list, bucket.delete].every(
      (method) => typeof method === "function",
    )
  )
    return undefined;
  const { origin, siteUrl, sitePath, repository, ref, workflow } = vars;
  return {
    origin,
    siteUrl,
    sitePath,
    bootstrapSecret,
    bucket: bucket as R2Bucket,
    github: { repository, ref, workflow, token },
  };
}
