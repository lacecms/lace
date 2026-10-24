import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { loadProjectConfig } from "../dist/project-config.js";
import { createLaceApp } from "@lacecms/server";

function sortJson(value) {
  if (Array.isArray(value)) return value.map(sortJson);
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => [key, sortJson(nested)]),
  );
}

const config = await loadProjectConfig();
const app = createLaceApp({
  actors: { resolve: async () => null },
  config,
  content: {},
  links: {},
  environment: { engineVersion: "0.0.0", openApiTitle: "Lace API" },
  logger: { log: () => {} },
  maxBodyBytes: 1_048_576,
  publicContent: {},
  rateLimiter: { check: async () => true },
  readiness: { isReady: async () => true },
  requestIds: { next: () => "openapi" },
});
const response = await app.fetch(new Request("https://openapi.lace.test/api/v1/openapi.json"));
if (!response.ok) throw new Error(`OpenAPI generation failed with status ${response.status}.`);
const outputPath = resolve("apps/api/openapi/api-v1.json");
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(sortJson(await response.json()), null, 2)}\n`);
execFileSync("pnpm", ["exec", "oxfmt", "--write", outputPath], { stdio: "inherit" });
