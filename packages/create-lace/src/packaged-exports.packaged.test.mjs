import { expect, test } from "vitest";

test("packaged entry point keeps its public exports", async () => {
  expect(Object.keys(await import("../dist/index.js")).sort()).toEqual([
    "GeneratorError",
    "SITE_MODES",
    "TEMPLATE_FILES",
    "TEMPLATE_VERSION",
    "TemplateError",
    "generateProject",
    "normalizeSitePath",
    "renderCloudflareMarkers",
    "renderForSite",
    "renderSiteMarkers",
    "runCli",
  ]);
});
