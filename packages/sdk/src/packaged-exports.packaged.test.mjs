import { expect, test } from "vitest";

test("packaged entry point keeps its public exports", async () => {
  expect(Object.keys(await import("../dist/index.js")).sort()).toEqual([
    "LaceContractError",
    "LaceHttpError",
    "LaceLinkManifestError",
    "LacePublishedSiteError",
    "LaceSdkError",
    "LaceTimeoutError",
    "LaceTransportError",
    "LaceUnsupportedExportFormatError",
    "createLaceClient",
    "createPublishedSiteLoader",
    "packageName",
    "renderRobotsTxt",
    "renderSitemapXml",
    "resolveSeo",
    "seoText",
    "siteUrlFor",
    "userAgent",
  ]);
});
