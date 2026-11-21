export interface PreviewRunnerSettings {
  readonly secret: string;
  readonly bootstrapSecret: string;
  readonly siteUrl: string;
}

export function parsePreviewRunnerSettings(
  environment: Readonly<Record<string, string | undefined>>,
  siteUrl: string | undefined,
): PreviewRunnerSettings | undefined {
  if (environment.LACE_PREVIEW_ENABLED !== "true") return undefined;
  const secret = environment.LACE_PREVIEW_BUILDER_SECRET;
  const bootstrapSecret = environment.LACE_PREVIEW_RUNNER_SECRET;
  const credential = /^[\x21-\x7e]{32,256}(?![\s\S])/u;
  if (
    !secret ||
    !credential.test(secret) ||
    !bootstrapSecret ||
    !credential.test(bootstrapSecret) ||
    secret === bootstrapSecret ||
    siteUrl === undefined ||
    [environment.LACE_BUILDER_SECRET, environment.LACE_BUILD_TOKEN].some(
      (value) => value === secret || value === bootstrapSecret,
    )
  )
    return undefined;
  return { secret, bootstrapSecret, siteUrl };
}
