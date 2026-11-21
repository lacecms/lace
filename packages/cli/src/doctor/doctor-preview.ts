import { isAbsolute, resolve } from "node:path";
import { satisfies } from "semver";
import { parseJsonc } from "../shared/jsonc.js";
import type { DoctorIO } from "./doctor-io.js";
import { observation } from "./doctor-probes.js";
import type { DoctorOptions, Observation } from "./doctor-report.js";
import { apiUrl, type Values } from "./doctor-settings.js";
import { installedPackage, optionalFile, readSiteSelection } from "./doctor-site.js";

const SITE_URL = "LACE_BUILD_SITE_URL";
const NODE_SETTINGS = [
  "LACE_PREVIEW_ORIGIN",
  "LACE_PREVIEW_BUILDER_SECRET",
  "LACE_PREVIEW_RUNNER_SECRET",
] as const;
const CLOUDFLARE_VARS = [
  "LACE_PREVIEW_ORIGIN",
  "LACE_PREVIEW_GITHUB_REPOSITORY",
  "LACE_PREVIEW_GITHUB_REF",
  "LACE_PREVIEW_GITHUB_WORKFLOW",
  "LACE_PREVIEW_SITE_PATH",
] as const;

function previewNotice(code: string, reason: string, action: string) {
  return observation("skipped", code, reason, action);
}

function configurationRequired(fields: readonly string[], action: string) {
  return previewNotice(
    "PREVIEW_CONFIGURATION_REQUIRED",
    `Missing or invalid preview settings: ${fields.join(", ")}.`,
    action,
  );
}

type Source = { readonly root: string; readonly action: string };
type Site = NonNullable<Awaited<ReturnType<typeof readSiteSelection>>>;

async function nodePreviewSource(
  options: DoctorOptions,
  values: Values,
  cwd: string,
  site: Exclude<Site, { mode: "none" }>,
): Promise<Source | Observation> {
  const compose = options.mode === "compose";
  const action = "See protected draft preview in docs/lace-compose-production.md.";
  const fields = [
    SITE_URL,
    "LACE_PUBLIC_BASE_URL",
    ...NODE_SETTINGS,
    ...(compose
      ? ["LACE_PREVIEW_HOST"]
      : ["LACE_PREVIEW_RUNNER_ORIGIN", "LACE_PREVIEW_BUILDER_URL"]),
  ];
  const missing = fields.filter((key) => !values[key]?.trim());
  if (missing.length > 0) return configurationRequired(missing, action);

  const { parseNodePreviewSettings } = await import("@lacecms/platform-node");
  const admin = apiUrl(values.LACE_PUBLIC_BASE_URL);
  const runtimeValues = compose
    ? {
        ...values,
        LACE_PREVIEW_RUNNER_ORIGIN: "http://api:3000/",
        LACE_PREVIEW_BUILDER_URL: "http://builder:8788/",
      }
    : values;
  const settings = admin && parseNodePreviewSettings(runtimeValues, admin);
  if (!settings) return configurationRequired(fields, action);
  if (compose && values.LACE_PREVIEW_HOST !== settings.origin.hostname)
    return configurationRequired(["LACE_PREVIEW_HOST", "LACE_PREVIEW_ORIGIN"], action);

  if (!compose)
    return previewNotice(
      "PREVIEW_BUILDER_SOURCE_UNVERIFIED",
      "Local API settings pass. The separately operated builder owns the selected source and its Astro installation.",
      `${action} Check the builder checkout, dependencies and integration there.`,
    );
  const root = values.LACE_BUILD_SOURCE_ROOT || (site.mode === "starter" ? "." : site.path);
  const directory = values.LACE_BUILD_SITE_DIR || (site.mode === "starter" ? "site" : ".");
  if (directory !== "." && (isAbsolute(directory) || directory.split("/").includes("..")))
    return configurationRequired(["LACE_BUILD_SITE_DIR"], action);
  return { root: resolve(cwd, root, directory), action };
}

interface WranglerPreviewConfig {
  readonly vars?: Values;
  readonly r2_buckets?: readonly { readonly binding?: string; readonly bucket_name?: string }[];
  readonly triggers?: { readonly crons?: readonly string[] };
}

async function cloudflarePreviewSource(
  io: DoctorIO,
  values: Values,
  cwd: string,
  signal: AbortSignal,
): Promise<Source | Observation> {
  const action = "See protected draft preview in docs/lace-cloudflare.md.";
  if (!values.LACE_WRANGLER_CONFIG) return configurationRequired(["LACE_WRANGLER_CONFIG"], action);
  const config = parseJsonc(
    await io.file(resolve(cwd, values.LACE_WRANGLER_CONFIG), signal),
  ) as WranglerPreviewConfig | null;
  const vars = config?.vars;
  const buckets = config?.r2_buckets;
  const previewBucket =
    Array.isArray(buckets) && buckets.find((entry) => entry?.binding === "PREVIEW")?.bucket_name;
  if (!CLOUDFLARE_VARS.some((key) => vars?.[key]) && !previewBucket)
    return previewNotice(
      "PREVIEW_DISABLED",
      "Protected draft preview is optional and unconfigured.",
      action,
    );

  const { parseCloudflarePreviewVars, PREVIEW_MAINTENANCE_CRON } =
    await import("@lacecms/platform-cloudflare");
  const fields = ["LACE_PUBLIC_BASE_URL", SITE_URL, ...CLOUDFLARE_VARS];
  const missing: string[] = fields.filter((key) => !vars?.[key]);
  if (
    typeof previewBucket !== "string" ||
    !previewBucket.trim() ||
    buckets?.some((entry) => entry?.binding === "MEDIA" && entry.bucket_name === previewBucket)
  )
    missing.push("private PREVIEW R2 binding");
  const crons = config?.triggers?.crons;
  if (!Array.isArray(crons) || !crons.includes(PREVIEW_MAINTENANCE_CRON))
    missing.push("preview maintenance cron");
  if (missing.length > 0) return configurationRequired(missing, action);

  const admin = apiUrl(vars?.LACE_PUBLIC_BASE_URL);
  const settings = admin && vars && parseCloudflarePreviewVars(vars, admin);
  if (!settings) return configurationRequired(fields, action);
  const root = await io
    .process("git", ["rev-parse", "--show-toplevel"], cwd, signal)
    .catch(() => "");
  if (!isAbsolute(root))
    return previewNotice(
      "PREVIEW_SOURCE_UNVERIFIED",
      "The local Git root for LACE_PREVIEW_SITE_PATH could not be resolved.",
      `${action} Check the selected repository and ref.`,
    );
  return { root: resolve(root, settings.sitePath), action };
}

export async function previewCheck(
  options: DoctorOptions,
  values: Values,
  io: DoctorIO,
  cwd: string,
  signal: AbortSignal,
): Promise<Observation> {
  try {
    const site = await readSiteSelection(io, cwd, signal);
    if (!site || site.mode === "none")
      return previewNotice(
        "PREVIEW_SITE_UNAVAILABLE",
        "No Astro site is selected for protected draft preview.",
        "Connect an Astro site before configuring preview.",
      );
    if (
      options.target === "node" &&
      !NODE_SETTINGS.some((key) => values[key]) &&
      !values.LACE_PREVIEW_HOST
    )
      return previewNotice(
        "PREVIEW_DISABLED",
        "Protected draft preview is optional and unconfigured.",
        "See protected draft preview in docs/lace-compose-production.md if you want to configure it.",
      );

    const source =
      options.target === "node"
        ? await nodePreviewSource(options, values, cwd, site)
        : await cloudflarePreviewSource(io, values, cwd, signal);
    if ("kind" in source) return source;
    const manifest = JSON.parse(
      (await optionalFile(io, resolve(source.root, "package.json"), signal)) ?? "null",
    );
    const astro = JSON.parse((await installedPackage(io, source.root, "astro", signal)) ?? "null");
    const adapter = JSON.parse(
      (await installedPackage(io, source.root, "@lacecms/astro", signal)) ?? "null",
    );
    if (
      typeof (manifest?.dependencies?.astro ?? manifest?.devDependencies?.astro) !== "string" ||
      typeof astro?.version !== "string" ||
      // Server-side Astro preview preflight is restricted to this release line.
      !satisfies(astro.version, ">=7.4.12 <7.5.0") ||
      !adapter?.exports?.["./preview"]
    )
      return previewNotice(
        "PREVIEW_SITE_INCOMPATIBLE",
        "The selected site needs Astro 7.4.12 or a later 7.4 patch and @lacecms/astro/preview.",
        `${source.action} Install compatible packages in the selected site.`,
      );
    return observation(
      "pass",
      "PREVIEW_STATIC_CHECK_PASSED",
      "Local preview settings and selected Astro packages pass static checks.",
      options.target === "node"
        ? `${source.action} Check the integration, clean Git source, private storage and HTTPS routing on the deployment.`
        : `${source.action} Check the integration on the configured ref, HTTPS routing, private bucket and deployed Worker/GitHub credentials.`,
    );
  } catch {
    return previewNotice(
      "PREVIEW_CHECK_UNAVAILABLE",
      "Local preview configuration or package metadata could not be read safely.",
      "Check the generated manifest, selected settings and installed packages, then repeat doctor.",
    );
  }
}
