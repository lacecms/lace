import { expect, test } from "vitest";
import { defineCollection, definePage } from "@lacecms/config";
import { field } from "@lacecms/content";

import { admin, fixture, json } from "../test-support/app-harness.js";

const models = [
  definePage({ key: "home", path: "/", version: 1 }),
  defineCollection({ key: "posts", route: "/blog/:slug", version: 1 }),
  defineCollection({
    fields: { quote: field.textarea({ required: true }) },
    key: "testimonials",
    listFields: ["quote"],
    version: 1,
  }),
];

async function publishedTestimonials() {
  const harness = await fixture({ models });
  for (const title of ["Ada", "Grace"]) {
    const created = await harness.content.create({
      actor: admin,
      blocks: [],
      fields: { quote: `${title} says hi` },
      modelKey: "testimonials",
      title,
    });
    await harness.content.publish({ actor: admin, entryId: created.id, expectedRevision: 1 });
  }
  return harness;
}

test("serves published records of a route-less collection without paths", async () => {
  const { app } = await publishedTestimonials();
  const listed = await json(app, "/api/v1/public/records/testimonials");
  expect(listed.response.status).toBe(200);
  expect(listed.body.items.map((item: { title: string }) => item.title).sort()).toEqual([
    "Ada",
    "Grace",
  ]);
  for (const item of listed.body.items as Record<string, unknown>[]) {
    expect(item).toMatchObject({ fields: { quote: expect.any(String) }, modelKey: "testimonials" });
    expect(item).not.toHaveProperty("path");
    expect(item).not.toHaveProperty("slug");
  }
  const paged = await json(app, "/api/v1/public/records/testimonials?limit=1");
  expect(paged.body.items).toHaveLength(1);
  expect(paged.body.nextCursor).toEqual(expect.any(String));
});

test("records and collection reads answer 404 for the other kind", async () => {
  const { app } = await publishedTestimonials();
  for (const path of [
    "/api/v1/public/records/posts",
    "/api/v1/public/records/home",
    "/api/v1/public/records/unknown",
    "/api/v1/public/collections/testimonials",
    "/api/v1/public/collections/testimonials/ada",
  ])
    expect((await json(app, path)).response.status, path).toBe(404);
});

test("the build export and model DTOs describe route-less collections", async () => {
  const { app } = await publishedTestimonials();
  const exported = await json(app, "/api/v1/public/build-export");
  expect(exported.body.formatVersion).toBe(2);
  expect(exported.body.entries).toEqual([]);
  expect(exported.body.records.map((record: { title: string }) => record.title).sort()).toEqual([
    "Ada",
    "Grace",
  ]);
  const models = await json(app, "/api/v1/admin/content-models");
  const testimonials = models.body.items.find(
    (model: { key: string }) => model.key === "testimonials",
  );
  expect(testimonials).toMatchObject({ kind: "collection", listFields: ["quote"] });
  expect(testimonials).not.toHaveProperty("route");
  expect(testimonials).not.toHaveProperty("seo");
  const openApi = await json(app, "/api/v1/openapi.json");
  expect(openApi.body.paths["/api/v1/public/records/{modelKey}"].get.responses).toHaveProperty(
    "200",
  );
});
