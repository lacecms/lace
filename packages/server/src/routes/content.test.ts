// @ts-nocheck
// TODO(rf2): Type mutable content/model fixtures, branded snapshots and invalid lifecycle request matrices.
import { expect, test } from "vitest";
import { defineCollection, defineGlobal, definePage } from "@lacecms/config";

import { actorId } from "@lacecms/domain";

import { editor, fixture, json } from "../test-support/app-harness.js";

test("content model discovery retains interleaved declaration order", async () => {
  const models = [
    definePage({ key: "zebra", path: "/zebra", version: 1 }),
    defineCollection({ key: "posts", route: "/posts/:slug", version: 1 }),
    definePage({ key: "about", path: "/about", version: 1 }),
    defineGlobal({ key: "settings", version: 1 }),
  ];
  const { app } = await fixture({ actor: editor, models });
  const result = await json(app, "/api/v1/admin/content-models");
  expect(result.response.status).toBe(200);
  expect(result.body.items.map((item) => item.key)).toEqual([
    "zebra",
    "posts",
    "about",
    "settings",
  ]);
});

test("editor and viewer mutations are denied by the API independently of Admin controls", async () => {
  const editorApp = (await fixture({ actor: editor })).app;
  const viewerApp = (await fixture({ actor: { id: actorId("viewer"), role: "viewer" } })).app;
  const post = (body) => ({
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
  ]) {
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
