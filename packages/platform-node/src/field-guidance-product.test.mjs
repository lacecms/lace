import { expect, test } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defineCollection, defineConfig } from "@lacecms/config";
import { defineBlock, field } from "@lacecms/content";
import {
  createNodeRuntime,
  migrateNodeDatabase,
  parseNodeRuntimeSettings,
  runLocalContentSync,
} from "../dist/index.js";
import { createTestActorResolver } from "./test-actors.ts";
import { readCompleteBuildExport } from "@lacecms/test-utils";

test("CE9A real API keeps incomplete drafts savable and metadata sync preserves public content", async () => {
  const directory = await mkdtemp(join(tmpdir(), "lace-ce9a-"));
  let runtime;
  try {
    const databasePath = join(directory, "lace.sqlite");
    migrateNodeDatabase(databasePath);
    const make = (placeholder) =>
      defineConfig({
        blocks: [
          defineBlock({
            type: "card",
            version: 1,
            fields: { caption: field.text({ required: true, placeholder }) },
            settings: { tone: field.text({ defaultValue: "normal", placeholder }) },
          }),
        ],
        content: [
          defineCollection({
            key: "posts",
            route: "/posts/:slug",
            version: 1,
            blocks: ["card"],
            fields: {
              nested: field.group({
                required: true,
                fields: {
                  title: field.text({ required: true, minLength: 2, maxLength: 4, placeholder }),
                  tags: field.list({ item: field.text({ placeholder }) }),
                },
              }),
            },
          }),
        ],
      });
    const settings = parseNodeRuntimeSettings({
      LACE_AUTH_SECRET: "ce9a-integration-secret-long-enough",
      LACE_DATABASE_PATH: databasePath,
      LACE_PUBLIC_BASE_URL: "https://lace.test/",
      LACE_MINIO_TIMEOUT_MS: "1000",
      LACE_MINIO_ACCESS_KEY: "test",
      LACE_MINIO_SECRET_KEY: "test",
      LACE_MINIO_BUCKET: "test",
      LACE_MINIO_ENDPOINT: "http://localhost:9000",
      LACE_MINIO_REGION: "test",
    });
    const open = (config) =>
      createNodeRuntime({
        config,
        settings,
        actors: createTestActorResolver({ id: "ce9a-admin", role: "admin" }),
        logger: { log() {} },
        rateLimiter: { check: async () => true },
      });
    let syncId = 0;
    const sync = (config) =>
      runLocalContentSync({
        check: false,
        clock: { now: () => Date.now() },
        ids: { next: () => `ce9a-sync-${++syncId}` },
        models: config.runtime.content,
        blocks: config.runtime.blocks,
        target: runtime.repository,
        write() {},
      });
    const request = async (path, body, method = "POST", status = 200, headers = {}) => {
      const response = await runtime.app.fetch(
        new Request(`https://lace.test${path}`, {
          method,
          headers: { origin: "https://lace.test", "content-type": "application/json", ...headers },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        }),
      );
      const json = await response.json();
      if (status === 200) expect(response.status, JSON.stringify(json)).toBeLessThan(300);
      else expect(response.status, JSON.stringify(json)).toBe(status);
      return json;
    };
    const config = await make("First prompt");
    runtime = open(config);
    expect(await sync(config)).toBe(0);
    const created = await request("/api/v1/admin/models/posts/entries", {
      title: "Guidance",
      slug: "guidance",
      fields: {},
      blocks: [],
    });
    const path = `/api/v1/admin/entries/${created.id}`;
    const payload = { title: "Guidance", slug: "guidance", fields: { nested: {} }, blocks: [] };
    const partial = await request(
      `${path}/draft`,
      { ...payload, expectedRevision: created.draft.revision },
      "PUT",
    );
    await request(`${path}/publish`, { expectedRevision: partial.draft.revision }, "POST", 422);
    await request(
      `${path}/draft`,
      {
        ...payload,
        fields: { nested: { title: "Too long" } },
        expectedRevision: partial.draft.revision,
      },
      "PUT",
      422,
    );
    expect((await request(path, undefined, "GET")).draft).toEqual(partial.draft);
    const valid = await request(
      `${path}/draft`,
      {
        ...payload,
        fields: { nested: { title: " 😀 ", tags: ["a", "b"] } },
        blocks: [
          {
            key: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
            type: "card",
            schemaVersion: 1,
            position: 1000,
            data: { caption: "Saved" },
            settings: { tone: "normal" },
          },
        ],
        expectedRevision: partial.draft.revision,
      },
      "PUT",
    );
    await request(`${path}/publish`, { expectedRevision: valid.draft.revision });
    const before = await request(path, undefined, "GET");
    const token = await request("/api/v1/admin/api-tokens", { name: "CE9A build" });
    const readExport = async () =>
      (
        await readCompleteBuildExport(
          (url, init) => runtime.app.fetch(new Request(url, init)),
          "https://lace.test",
          token.token,
        )
      ).export;
    const exported = await readExport();
    const next = await make("Changed prompt");
    runtime.close();
    runtime = open(next);
    expect(await sync(next)).toBe(0);
    expect(await request(path, undefined, "GET")).toEqual(before);
    const afterExport = await readExport();
    expect(afterExport.entries).toEqual(exported.entries);
    expect(JSON.stringify(afterExport.entries)).not.toContain("placeholder");
    const metadata = await request("/api/v1/admin/content-models", undefined, "GET");
    expect(metadata.items[0].fields.nested.fields.title.placeholder).toBe("Changed prompt");
    // A failed optimistic save does not overwrite either snapshot.
    await request(`${path}/draft`, { ...payload, expectedRevision: 1 }, "PUT", 409);
    expect(await request(path, undefined, "GET")).toEqual(before);
  } finally {
    runtime?.close();
    await rm(directory, { recursive: true, force: true });
  }
});
