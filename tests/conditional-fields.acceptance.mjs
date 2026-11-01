// SM5A: conditional-field validation and draft retention on Node and the local
// Worker, through the admin REST boundary with one shared configuration.
import { expect, test } from "vitest";
import { defineCollection, defineConfig } from "../packages/config/dist/index.js";
import { builtInBlocks, defineBlock, field } from "../packages/content/dist/index.js";
import { openProductRuntime } from "./support/cross-runtime-fixture.mjs";

const kind = () =>
  field.select({ options: ["image", "video"], required: true, defaultValue: "image" });
const cta = defineBlock({
  type: "conditionalCta",
  version: 1,
  fields: { hasCta: field.boolean(), ctaUrl: field.url({ required: true }) },
  visibility: { ctaUrl: { field: "hasCta", values: [true] } },
});
const config = await defineConfig({
  blocks: [builtInBlocks.richText, cta],
  content: [
    defineCollection({
      blocks: ["conditionalCta"],
      fields: {
        heroKind: kind(),
        heroVideo: field.url({ required: true }),
        gallery: field.list({
          item: field.group({
            fields: {
              kind: kind(),
              media: field.text({ required: true }),
              videoUrl: field.url({ required: true }),
            },
            visibility: {
              media: { field: "kind", values: ["image"] },
              videoUrl: { field: "kind", values: ["video"] },
            },
          }),
        }),
      },
      key: "works",
      route: "/works/:slug",
      version: 1,
      visibility: { heroVideo: { field: "heroKind", values: ["video"] } },
    }),
  ],
});

test("conditional fields validate and retain drafts identically on both runtimes", async () => {
  const results = {};
  for (const runtime of ["node", "worker"]) {
    const f = await openProductRuntime(runtime, { config });
    try {
      const call = async (path, options = {}) => {
        const response = await f.call(path, { cookie: f.cookies.admin, ...options });
        return { status: response.status, body: await response.json() };
      };
      const models = await call("/api/v1/admin/content-models");
      const works = models.body.items.find((model) => model.key === "works");
      expect(works.visibility).toEqual({ heroVideo: { field: "heroKind", values: ["video"] } });
      expect(works.fields.gallery.item.visibility.videoUrl).toEqual({
        field: "kind",
        values: ["video"],
      });
      expect(works.blockDefinitions[0].visibility).toEqual({
        ctaUrl: { field: "hasCta", values: [true] },
      });

      const block = (data) => ({
        key: "cta-1",
        type: "conditionalCta",
        schemaVersion: 1,
        position: 1000,
        data,
      });
      const created = await call("/api/v1/admin/models/works/entries", {
        method: "POST",
        json: {
          title: "Work",
          slug: "work",
          fields: {
            heroKind: "video",
            heroVideo: "https://example.com/hero",
            gallery: [
              { kind: "video", videoUrl: "https://example.com/1" },
              { kind: "image", media: "cover" },
            ],
          },
          blocks: [block({ hasCta: true, ctaUrl: "https://example.com/cta" })],
        },
      });
      expect(created.status).toBe(201);
      let entry = created.body;
      const save = (fields, blocks) =>
        call(`/api/v1/admin/entries/${entry.id}/draft`, {
          method: "PUT",
          json: {
            expectedRevision: entry.draft.revision,
            title: "Work",
            slug: "work",
            fields,
            blocks,
          },
        });
      const publish = () =>
        call(`/api/v1/admin/entries/${entry.id}/publish`, {
          method: "POST",
          headers: { "idempotency-key": `conditional-${runtime}-${entry.draft.revision}` },
          json: { expectedRevision: entry.draft.revision },
        });

      // Switching controllers keeps hidden values in the stored draft.
      const switched = await save(
        {
          ...entry.draft.fields,
          heroKind: "image",
          gallery: [{ ...entry.draft.fields.gallery[0], kind: "image", media: "now" }],
        },
        [block({ hasCta: false, ctaUrl: "https://example.com/cta" })],
      );
      expect(switched.status).toBe(200);
      entry = switched.body;
      expect(entry.draft.fields).toEqual({
        heroKind: "image",
        heroVideo: "https://example.com/hero",
        gallery: [{ kind: "image", media: "now", videoUrl: "https://example.com/1" }],
      });
      expect(entry.draft.blocks[0].data).toEqual({
        hasCta: false,
        ctaUrl: "https://example.com/cta",
      });

      // Hidden required fields are not required for publication.
      const lean = await save({ heroKind: "image", gallery: [{ kind: "image", media: "now" }] }, [
        block({ hasCta: false }),
      ]);
      entry = lean.body;
      expect((await publish()).status).toBe(200);

      // Visible required fields still are, at the same paths on both runtimes.
      entry = (await call(`/api/v1/admin/entries/${entry.id}`)).body;
      const visible = await save({ heroKind: "video", gallery: [{ kind: "video" }] }, [
        block({ hasCta: true }),
      ]);
      entry = visible.body;
      const refused = await publish();
      // Hidden values still keep draft constraints.
      const unsafe = await save(
        { heroKind: "image", heroVideo: "javascript:alert(1)", gallery: [] },
        [],
      );
      results[runtime] = {
        refused: refused.status,
        issues: refused.body.error.details.issues.map((issue) => issue.path ?? issue.pointer),
        unsafe: unsafe.status,
        unsafeIssue: unsafe.body.error.details.issues.map((issue) => issue.path ?? issue.pointer),
        stored: entry.draft.fields,
      };
    } finally {
      await f.close();
    }
  }
  expect(results.node).toEqual({
    refused: 422,
    issues: ["/fields/gallery/0/videoUrl"],
    unsafe: 422,
    unsafeIssue: ["/fields/heroVideo"],
    stored: { heroKind: "video", gallery: [{ kind: "video" }] },
  });
  expect(results.worker).toEqual(results.node);
});
