// @ts-nocheck
// TODO(rf2): Type legacy SQLite/product harnesses, branded values and partial runtime adapters.
import { expect, test } from "vitest";
import { defineCollection, defineConfig } from "@lacecms/config";
import { field } from "@lacecms/content";
import * as platform from "./index.js";
import { openNodeTestRuntime } from "./test-support/node-runtime-harness.js";

test("real Node API projects layouts and keeps created slugs and conflict drafts", async () => {
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
  const harness = await openNodeTestRuntime(platform, {
    config,
    actor: { id: "ce9b-admin", role: "admin" },
    sync: true,
  });
  const call = async (path, body, method = "POST", status = 200) => {
    const response = await harness.request(path, {
      method,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
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
});
