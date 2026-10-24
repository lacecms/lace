import { expect, test } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defineCollection, defineConfig } from "@lacecms/config";
import { builtInBlocks, field } from "@lacecms/content";
import {
  createNodeRuntime,
  migrateNodeDatabase,
  parseNodeRuntimeSettings,
  runLocalContentSync,
} from "../dist/index.js";
import { createTestActorResolver } from "./test-actors.ts";

import { internalLinkHttpContract } from "../../../tests/fixtures/internal-link-http.mjs";
test("CE10 Node HTTP destination status and impact acknowledgment contract", async () => {
  const directory = await mkdtemp(join(tmpdir(), "lace-ce10-"));
  let runtime;
  try {
    const databasePath = join(directory, "lace.sqlite");
    migrateNodeDatabase(databasePath);
    const layout = { mode: "tabs", groups: [{ key: "main", label: "Main", fields: ["note"] }] };
    const config = await defineConfig({
      blocks: [builtInBlocks.cta],
      content: [
        defineCollection({
          key: "notes",
          route: "/notes/:slug",
          version: 1,
          fields: { note: field.text() },
          blocks: ["cta"],
          layout,
        }),
      ],
    });
    runtime = createNodeRuntime({
      config,
      actors: createTestActorResolver({ id: "ce9b-admin", role: "admin" }),
      logger: { log() {} },
      rateLimiter: { check: async () => true },
      settings: parseNodeRuntimeSettings({
        LACE_AUTH_SECRET: "ce9b-test-secret-at-least-32-characters",
        LACE_DATABASE_PATH: databasePath,
        LACE_PUBLIC_BASE_URL: "https://lace.test/",
        LACE_MINIO_ACCESS_KEY: "test",
        LACE_MINIO_SECRET_KEY: "test",
        LACE_MINIO_TIMEOUT_MS: "1000",
        LACE_MINIO_BUCKET: "test",
        LACE_MINIO_ENDPOINT: "http://localhost:9000",
        LACE_MINIO_REGION: "test",
      }),
    });
    let id = 0;
    expect(
      await runLocalContentSync({
        check: false,
        clock: { now: () => Date.now() },
        ids: { next: () => `sync-${++id}` },
        models: config.runtime.content,
        blocks: config.runtime.blocks,
        target: runtime.repository,
        write() {},
      }),
    ).toBe(0);
    const journey = await internalLinkHttpContract(async (path, init) => {
      const response = await runtime.app.fetch(
        new Request(`https://lace.test${path}`, {
          method: init.method,
          headers: {
            origin: "https://lace.test",
            "content-type": "application/json",
            ...init.headers,
          },
          ...(init.json === undefined ? {} : { body: JSON.stringify(init.json) }),
        }),
      );
      return { response, body: response.status === 204 ? undefined : await response.json() };
    }, expect);
    const { internalLinkBuildContract } =
      await import("../../../tests/fixtures/internal-link-build.mjs");
    await internalLinkBuildContract(journey, expect);
  } finally {
    runtime?.close();
    await rm(directory, { recursive: true, force: true });
  }
}, 60_000);
