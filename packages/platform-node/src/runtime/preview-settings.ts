export interface NodePreviewSettings {
  readonly origin: URL;
  readonly runnerOrigin: URL;
  readonly builderOrigin: URL;
  readonly builderSecret: string;
  readonly bootstrapSecret: string;
  readonly siteUrl: string;
}

function httpUrl(value: string | undefined, originOnly: boolean): URL | undefined {
  if (!value || value.includes("?") || value.includes("#")) return undefined;
  try {
    const url = new URL(value);
    if (
      ["https:", "http:"].includes(url.protocol) &&
      !url.username &&
      !url.password &&
      (!originOnly || url.pathname === "/")
    )
      return url;
  } catch {
    // Incomplete or invalid optional preview settings keep the feature unavailable.
  }
  return undefined;
}

export function parseNodePreviewSettings(
  env: Readonly<Record<string, string | undefined>>,
  admin: URL,
): NodePreviewSettings | undefined {
  const origin = httpUrl(env.LACE_PREVIEW_ORIGIN, true);
  const runnerOrigin = httpUrl(env.LACE_PREVIEW_RUNNER_ORIGIN, true);
  const builderOrigin = httpUrl(env.LACE_PREVIEW_BUILDER_URL, true);
  const site = httpUrl(env.LACE_BUILD_SITE_URL, false);
  const builderSecret = env.LACE_PREVIEW_BUILDER_SECRET;
  const bootstrapSecret = env.LACE_PREVIEW_RUNNER_SECRET;
  const credential = /^[\x21-\x7e]{32,256}(?![\s\S])/u;
  if (
    !origin ||
    origin.protocol !== "https:" ||
    admin.protocol !== "https:" ||
    !runnerOrigin ||
    !builderOrigin ||
    !site ||
    new Set([admin.hostname, origin.hostname, runnerOrigin.hostname]).size !== 3 ||
    !builderSecret ||
    !bootstrapSecret ||
    !credential.test(builderSecret) ||
    !credential.test(bootstrapSecret) ||
    builderSecret === bootstrapSecret ||
    [env.LACE_BUILDER_SECRET, env.LACE_BUILD_TOKEN, env.LACE_AUTH_SECRET].some(
      (value) => value === builderSecret || value === bootstrapSecret,
    )
  )
    return undefined;
  return {
    origin,
    runnerOrigin,
    builderOrigin,
    builderSecret,
    bootstrapSecret,
    siteUrl: site.href,
  };
}
