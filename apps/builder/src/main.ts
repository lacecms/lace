import { createServer } from "node:http";
import { createBuilderHandler } from "./server.js";
import { FixedCommandBuilder } from "./runner.js";
import { parseSiteOutputSettings } from "./settings.js";

const secret = process.env.LACE_BUILDER_SECRET;
const apiBaseUrl = process.env.LACE_API_BASE_URL;
const buildToken = process.env.LACE_BUILD_TOKEN;
if (secret === undefined || apiBaseUrl === undefined || buildToken === undefined)
  throw new Error(
    "Missing builder configuration: LACE_BUILDER_SECRET, LACE_API_BASE_URL, and LACE_BUILD_TOKEN are required.",
  );

const siteOutput = parseSiteOutputSettings(process.env);

const builder = new FixedCommandBuilder({
  sourceRoot: "/source",
  siteDirectory: process.env.LACE_BUILD_SITE_DIR ?? "site",
  outputDirectory: process.env.LACE_BUILD_OUTPUT_DIR ?? "dist",
  workRoot: "/work",
  outputRoot: "/output",
  cacheRoot: "/cache",
  apiBaseUrl,
  buildToken,
  ...(process.env.LACE_PUBLIC_BASE_URL === undefined
    ? {}
    : { publicBaseUrl: process.env.LACE_PUBLIC_BASE_URL }),
  ...siteOutput,
});
const handler = createBuilderHandler({ secret, build: (request) => builder.build(request) });
const server = createServer((request, response) => {
  void handler(request, response).catch(() => {
    if (!response.headersSent) response.writeHead(500, { "content-type": "application/json" });
    response.end('{"status":"failed","reason":"build_failed"}');
  });
});
server.listen(8788, "0.0.0.0");
