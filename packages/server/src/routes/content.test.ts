import { expect, test } from "vitest";
import { defineCollection, defineGlobal, definePage } from "@lacecms/config";

import * as v from "valibot";
import { contentModelListSchema } from "@lacecms/contracts";
import { actorId } from "@lacecms/domain";

import { editor, fixture, json } from "../test-support/app-harness.js";

test("entry detail returns a draft precondition without caching the publication", async () => {
  const { app } = await fixture();
  const draft = { blocks: [], fields: {}, slug: "post", title: "Post" };
  const requestJson = (method: string, body: unknown, headers: Record<string, string> = {}) => ({
    body: JSON.stringify(body),
    headers: { "content-type": "application/json", ...headers },
    method,
  });
  const created = await json(app, "/api/v1/admin/models/posts/entries", requestJson("POST", draft));
  expect(created.response.status).toBe(201);
  const path = `/api/v1/admin/entries/${created.body.id}`;
  const { response, body } = await json(app, path);
  const etag = response.headers.get("etag")!;
  expect(etag).toBe(`"${body.draft.revision}"`);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(
    (await json(app, `${path}/publish`, requestJson("POST", {}, { "if-match": etag }))).response
      .status,
  ).toBe(200);

  const published = await json(app, path, { headers: { "if-none-match": etag } });
  expect(published).toMatchObject({
    body: { published: { state: "published" } },
    response: { status: 200 },
  });
  expect(published.response.headers.get("etag")).toBe(etag);
  expect(published.response.headers.get("cache-control")).toBe("no-store");

  const save = (title: string) =>
    json(app, `${path}/draft`, requestJson("PUT", { ...draft, title }, { "if-match": etag }));
  expect((await save("Changed")).response.status).toBe(200);
  expect(await save("Stale")).toMatchObject({
    body: { error: { code: "CONTENT_REVISION_CONFLICT" } },
    response: { status: 409 },
  });
  const updated = await json(app, path);
  expect(updated.body.draft).toMatchObject({ revision: 2, title: "Changed" });
  expect(updated.response.headers.get("etag")).toBe('"2"');

  const missing = await json(app, "/api/v1/admin/entries/missing");
  expect(missing.response.status).toBe(404);
  expect(missing.response.headers.get("etag")).toBeNull();
  const unauthorized = await json((await fixture({ actor: null })).app, path);
  expect(unauthorized.response.status).toBe(401);
  expect(unauthorized.response.headers.get("etag")).toBeNull();
});

test("content model discovery retains interleaved declaration order and sidebar icons", async () => {
  const models = [
    definePage({ icon: "house", key: "zebra", path: "/zebra", version: 1 }),
    defineCollection({ key: "posts", route: "/posts/:slug", version: 1 }),
    definePage({ key: "about", path: "/about", version: 1 }),
    defineGlobal({ icon: "⚙️", key: "settings", version: 1 }),
  ];
  const { app } = await fixture({ actor: editor, models });
  const result = await json(app, "/api/v1/admin/content-models");
  expect(result.response.status).toBe(200);
  const items = v.parse(contentModelListSchema, result.body).items;
  expect(items.map((item) => item.key)).toEqual(["zebra", "posts", "about", "settings"]);
  expect(items.map((item) => item.icon)).toEqual(["house", undefined, undefined, "⚙️"]);
  expect(items[1]).not.toHaveProperty("icon");
});

test("editor and viewer mutations are denied by the API independently of Admin controls", async () => {
  const editorApp = (await fixture({ actor: editor })).app;
  const viewerApp = (await fixture({ actor: { id: actorId("viewer"), role: "viewer" } })).app;
  const post = (body: unknown): RequestInit => ({
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  for (const [path, init] of [
    [
      "/api/v1/admin/entries/missing/publish",
      {
        ...post({ expectedRevision: 1 }),
        headers: { "content-type": "application/json", "idempotency-key": "acceptance" },
      },
    ],
    ["/api/v1/admin/invitations", post({ email: "other@example.test", role: "viewer" })],
    ["/api/v1/admin/api-tokens", post({ name: "disallowed" })],
  ] as const) {
    expect((await json(editorApp, path, init)).response.status).toBe(403);
  }
  expect(
    (
      await json(
        viewerApp,
        "/api/v1/admin/models/posts/entries",
        post({ title: "Denied", slug: "denied", fields: {}, blocks: [] }),
      )
    ).response.status,
  ).toBe(403);
  const media = new FormData();
  media.append("file", new File([new Uint8Array([1])], "denied.png", { type: "image/png" }));
  expect(
    (
      await viewerApp.fetch(
        new Request("https://lace.test/api/v1/admin/media", { body: media, method: "POST" }),
      )
    ).status,
  ).toBe(403);
});
