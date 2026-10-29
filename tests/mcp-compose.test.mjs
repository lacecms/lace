import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { expect, test } from "vitest";

const docker = spawnSync("docker", ["compose", "version"], { stdio: "ignore" }).status === 0;
// Resolve real Compose interpolation using disposable, non-secret values only.
test.skipIf(!docker)(
  "development Compose forwards the MCP opt-in without coercing invalid flags",
  () => {
    const directory = mkdtempSync(join(tmpdir(), "lace-compose-mcp-"));
    const environment = join(directory, ".env");
    const required = {
      LACE_ADMIN_DEV_ORIGIN: "http://admin:5173",
      LACE_AUTH_SECRET: "compose-test-placeholder",
      LACE_DATABASE_PATH: "/workspace/dev-data/lace.sqlite",
      LACE_MINIO_ROOT_ACCESS_KEY: "fixture",
      LACE_MINIO_ROOT_SECRET: "fixture-placeholder",
      LACE_MINIO_BUCKET: "fixture",
      LACE_MINIO_ENDPOINT: "http://minio:9000",
      LACE_MINIO_REGION: "fixture",
      LACE_MINIO_TIMEOUT_MS: "5000",
      LACE_PUBLIC_BASE_URL: "http://127.0.0.1:43210/",
      LACE_SITE_DEV_ORIGIN: "http://site:4321",
    };
    const clean = { ...process.env };
    for (const key of Object.keys(clean)) if (key.startsWith("LACE_")) delete clean[key];
    try {
      for (const value of [undefined, "", "false", "true", "TRUE", "1"]) {
        writeFileSync(
          environment,
          Object.entries({
            ...required,
            ...(value === undefined ? {} : { LACE_MCP_ENABLED: value }),
          })
            .map(([key, item]) => `${key}=${item}`)
            .join("\n"),
        );
        const config = JSON.parse(
          execFileSync(
            "docker",
            [
              "compose",
              "--project-name",
              "lace-mcp-config-test",
              "--env-file",
              environment,
              "--file",
              resolve("docker-compose.dev.yml"),
              "config",
              "--format",
              "json",
            ],
            { env: clean, encoding: "utf8" },
          ),
        );
        expect(config.services.api.environment.LACE_MCP_ENABLED).toBe(value || "false");
      }
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  },
);
