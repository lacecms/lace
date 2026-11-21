import { expect, test } from "vitest";
import { parseCloudflarePreviewSettings } from "./preview-settings.js";

const admin = new URL("https://cms.example.com/");
const bucket = { get() {}, put() {}, head() {}, list() {}, delete() {} };
const env = {
  PREVIEW: bucket,
  LACE_PREVIEW_ENABLED: "true",
  LACE_PREVIEW_ORIGIN: "https://preview.example.com/",
  LACE_BUILD_SITE_URL: "https://www.example.com/blog/",
  LACE_PREVIEW_SITE_PATH: "apps/site",
  LACE_PREVIEW_GITHUB_REPOSITORY: "lacecms/site",
  LACE_PREVIEW_GITHUB_WORKFLOW: "lace-preview.yml",
  LACE_PREVIEW_GITHUB_REF: "main",
  LACE_PREVIEW_GITHUB_TOKEN: "a".repeat(40),
  LACE_PREVIEW_RUNNER_SECRET: "b".repeat(40),
};

test("preview requires isolated HTTPS ingress, private binding and complete operator settings", () => {
  expect(parseCloudflarePreviewSettings(env, admin)).toMatchObject({
    origin: new URL(env.LACE_PREVIEW_ORIGIN),
    sitePath: "apps/site",
    siteUrl: env.LACE_BUILD_SITE_URL,
  });
  expect(parseCloudflarePreviewSettings({}, admin)).toBeUndefined();
  for (const change of [
    { LACE_PREVIEW_ENABLED: undefined },
    { LACE_PREVIEW_ENABLED: "false" },
    { LACE_PREVIEW_ENABLED: true },
    { LACE_PREVIEW_ENABLED: "TRUE" },
    { PREVIEW: undefined },
    { PREVIEW: { get() {} } },
    { MEDIA: bucket },
    { LACE_PREVIEW_ORIGIN: admin.href },
    { LACE_PREVIEW_ORIGIN: "https://preview.example.com/sub/" },
    { LACE_PREVIEW_SITE_PATH: "apps/../site" },
    { LACE_PREVIEW_GITHUB_REPOSITORY: "other.invalid/a/b" },
    { LACE_PREVIEW_GITHUB_REF: "../main" },
    { LACE_PREVIEW_GITHUB_WORKFLOW: "../publish.yml" },
    { LACE_PREVIEW_RUNNER_SECRET: env.LACE_PREVIEW_GITHUB_TOKEN },
    { LACE_AUTH_SECRET: env.LACE_PREVIEW_RUNNER_SECRET },
  ])
    expect(parseCloudflarePreviewSettings({ ...env, ...change }, admin)).toBeUndefined();
});
