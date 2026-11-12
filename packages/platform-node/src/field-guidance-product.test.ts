// @ts-nocheck
// TODO(rf2): Type legacy SQLite/product harnesses, branded values and partial runtime adapters.
import { expect, test } from "vitest";
import { defineCollection, defineConfig } from "@lacecms/config";
import { defineBlock, field } from "@lacecms/content";
import * as platform from "./index.js";
import { openNodeTestRuntime } from "./test-support/node-runtime-harness.js";
import { readCompleteBuildExport } from "@lacecms/test-utils";

test("real API keeps incomplete drafts savable and metadata sync preserves public content", async () => {
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
  const request = async (path, body, method = "POST", status = 200, headers = {}) => {
    const response = await harness.request(path, {
      method,
      headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const json = await response.json();
    if (status === 200) expect(response.status, JSON.stringify(json)).toBeLessThan(300);
    else expect(response.status, JSON.stringify(json)).toBe(status);
    return json;
  };
  const config = await make("First prompt");
  const harness = await openNodeTestRuntime(platform, {
    config,
    actor: { id: "ce9a-admin", role: "admin" },
  });
  expect(await harness.sync()).toBe(0);
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
        (url, init) => harness.runtime.app.fetch(new Request(url, init)),
        "https://lace.test",
        token.token,
      )
    ).export;
  const exported = await readExport();
  const next = await make("Changed prompt");
  harness.reopen(next);
  expect(await harness.sync()).toBe(0);
  expect(await request(path, undefined, "GET")).toEqual(before);
  const afterExport = await readExport();
  expect(afterExport.entries).toEqual(exported.entries);
  expect(JSON.stringify(afterExport.entries)).not.toContain("placeholder");
  const metadata = await request("/api/v1/admin/content-models", undefined, "GET");
  expect(metadata.items[0].fields.nested.fields.title.placeholder).toBe("Changed prompt");
  // A failed optimistic save does not overwrite either snapshot.
  await request(`${path}/draft`, { ...payload, expectedRevision: 1 }, "PUT", 409);
  expect(await request(path, undefined, "GET")).toEqual(before);
});
