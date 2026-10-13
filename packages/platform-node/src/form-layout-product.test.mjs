import { expect, test } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defineCollection, defineConfig } from "@lacecms/config";
import { field } from "@lacecms/content";
import {
  createNodeRuntime,
  migrateNodeDatabase,
  parseNodeRuntimeSettings,
  runLocalContentSync,
} from "../dist/index.js";
import { createTestActorResolver } from "./test-actors.ts";

test("CE9B real Node API projects layouts and keeps created slugs and conflict drafts", async () => {
  const directory = await mkdtemp(join(tmpdir(), "lace-ce9b-"));
  let runtime;
  try {
    const databasePath = join(directory, "lace.sqlite");
    migrateNodeDatabase(databasePath);
    const layout = { mode: "tabs", groups: [{ key: "main", label: "Main", fields: ["note"] }] };
    const config = await defineConfig({
      content: [
        defineCollection({
          key: "posts",
          route: "/posts/:slug",
          version: 1,
          fields: { note: field.text() },
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
    const call = async (path, body, method = "POST", status = 200) => {
      const response = await runtime.app.fetch(
        new Request(`https://lace.test${path}`, {
          method,
          headers: { origin: "https://lace.test", "content-type": "application/json" },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        }),
      );
      const data = await response.json();
      expect(response.status, JSON.stringify(data)).toBe(status);
      return data;
    };
    const metadata = await call("/api/v1/admin/content-models", undefined, "GET");
    expect(metadata.items[0].layout).toEqual(layout);
    const payload = {
      title: "Café & News",
      slug: "cafe-news",
      fields: { note: "Stored" },
      blocks: [],
    };
    const created = await call("/api/v1/admin/models/posts/entries", payload, "POST", 201);
    expect(created.draft.slug).toBe("cafe-news");
    const path = `/api/v1/admin/entries/${created.id}`;
    const saved = await call(
      `${path}/draft`,
      { ...payload, title: "Later", expectedRevision: 1 },
      "PUT",
    );
    expect(saved.draft.slug).toBe("cafe-news");
    await call(`${path}/publish`, { expectedRevision: saved.draft.revision });
    const duplicate = await call(`${path}/duplicate`, {}, "POST", 201);
    expect(duplicate.draft.slug).toBeUndefined();
    const second = await call(
      "/api/v1/admin/models/posts/entries",
      { ...payload, title: "Conflict" },
      "POST",
      201,
    );
    await call(`/api/v1/admin/entries/${second.id}/publish`, { expectedRevision: 1 }, "POST", 409);
    expect((await call(`/api/v1/admin/entries/${second.id}`, undefined, "GET")).draft).toEqual(
      second.draft,
    );
    const slugless = await call(
      "/api/v1/admin/models/posts/entries",
      { title: "Новости", fields: {}, blocks: [] },
      "POST",
      201,
    );
    expect(slugless.draft.slug).toBeUndefined();
  } finally {
    runtime?.close();
    await rm(directory, { recursive: true, force: true });
  }
});
