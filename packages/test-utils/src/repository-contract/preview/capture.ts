import { capturePreviewInput, PreviewAdmissionService } from "@lacecms/application";
import type {
  BuildContentExportPage,
  PreviewInputStore,
  PreviewSourceReservation,
  PreviewTarget,
} from "@lacecms/application";
import { defineCollection, defineConfig, defineGlobal, definePage } from "@lacecms/config";
import { defineBlock, field } from "@lacecms/content";
import { blockKey, unixMilliseconds } from "@lacecms/domain";
import {
  admin,
  editor,
  entry,
  heroBlock,
  publish,
  registerContract,
  seedMedia,
  sequence,
} from "../shared.js";
import type { RepositoryContractCase } from "../shared.js";
import { openPreview, previewInput, previewOutput } from "./fixtures.js";

export const cases: RepositoryContractCase[] = [];
const contract = registerContract(cases);
const clock = { now: () => unixMilliseconds(150) };
export const manifest = { sha256: "a".repeat(64), bytes: 10 };

export function memoryInput() {
  const pages: BuildContentExportPage[] = [];
  const targets: PreviewTarget[] = [];
  let seals = 0;
  const store: PreviewInputStore = {
    async writeTarget(_id, target) {
      targets.push(target);
      return manifest;
    },
    async writeContextPage(_id, _index, page) {
      pages.push(page);
      return manifest;
    },
    async sealInput() {
      seals++;
      return manifest;
    },
    async purge() {
      return "empty";
    },
  };
  return {
    store,
    pages,
    targets,
    get seals() {
      return seals;
    },
  };
}

contract(
  "preview capture validates and overlays only the saved target on published context",
  async (runtime, expect) => {
    const { repository, target, other, sql } = await openPreview(runtime);
    const callout = defineBlock({
      type: "callout",
      version: 1,
      fields: { headline: field.text({ required: true }) },
    });
    const config = await defineConfig({
      blocks: [callout],
      content: [
        definePage({
          key: "home",
          path: "/",
          version: 1,
          blocks: ["callout"],
          fields: {
            show: field.boolean(),
            text: field.text(),
            link: field.url({ required: true }),
          },
          visibility: { link: { field: "show", values: [true] } },
        }),
        defineCollection({ key: "posts", route: "/blog/:slug", version: 1 }),
        defineGlobal({ key: "settings", version: 1 }),
        defineCollection({ key: "testimonials", version: 1 }),
      ],
    });
    for (const model of config.runtime.content)
      await sql.run(
        "update content_models set structure_hash=?, projection_hash=? where key=?",
        model.structureHash,
        model.projectionHash,
        model.key,
      );
    const headline = {
      type: "callout",
      key: blockKey("headline"),
      position: 1000,
      data: {},
      hidden: false,
      schemaVersion: 1,
      settings: {},
    };
    await sql.run(
      "insert into content_blocks (snapshot_id,block_key,block_type,position,schema_version,data_json,created_at,updated_at) values (?, 'headline','callout',1000,1,'{}',1,1)",
      target.draft.id,
    );
    let releaseCount = 0;
    let reserve: () => Promise<PreviewSourceReservation> = async () => ({
      source: { executor: "fixture", commit: "a".repeat(40) },
      async release() {
        releaseCount++;
      },
    });
    const admission = new PreviewAdmissionService({
      config: config.runtime,
      clock,
      content: repository,
      media: repository,
      idGenerator: { next: sequence("preview") },
      reserveSource: () => reserve(),
      preview: repository.preview,
    });
    const request = { entryId: target.id, expectedRevision: 1, idempotencyKey: "preview" };
    await expect(admission.create(editor, request)).rejects.toMatchObject({
      issues: expect.arrayContaining([
        expect.objectContaining({ path: expect.arrayContaining(["headline"]) }),
      ]),
    });
    expect(await repository.preview.currentPreview(target.id, clock.now())).toBeNull();
    await repository.saveCompleteDraft({
      entryId: target.id,
      mutation: {
        expectedRevision: 1,
        title: "draft target",
        fields: { show: false, link: "https://hidden.test/" },
        blocks: [{ ...headline, hidden: true }],
        mediaReferences: [],
        updatedBy: editor,
        updatedAt: unixMilliseconds(3),
      },
    });
    for (const draft of [
      entry("settings", "settings", { updatedAt: 1, fields: { text: "settings" } }),
      entry("record", "testimonials", { updatedAt: 1, fields: { text: "record" } }),
    ]) {
      await repository.create({ entry: draft, mediaReferences: [] });
      await repository.publish(publish(draft.id, 1, 5));
    }
    const receipt = await admission.create(editor, { ...request, expectedRevision: 2 });
    expect(receipt.kind).toBe("admitted");
    if (receipt.kind !== "admitted") throw new Error("Expected an admitted preview.");
    const { store, pages, targets } = memoryInput();
    expect(
      await capturePreviewInput(
        { preview: repository.preview, content: repository.preview, store, clock },
        receipt.generation,
      ),
    ).toEqual({ kind: "sealed" });
    expect(targets).toMatchObject([{ title: "draft target", fields: { show: false }, blocks: [] }]);
    expect(targets[0]!.fields).not.toHaveProperty("link");
    expect(pages.flatMap((page) => page.entries)).toEqual([]);
    expect(pages.flatMap((page) => page.globals ?? []).map(({ entry }) => entry.id)).toEqual([
      "settings",
    ]);
    expect(pages.flatMap((page) => page.records).map(({ entry }) => entry.id)).toEqual(["record"]);
    expect(await repository.loadPublic("/")).toBeNull();
    expect(await repository.loadPublic("/blog/other")).toBeNull();

    expect(releaseCount).toBe(0);
    const retry = { ...request, expectedRevision: 2, idempotencyKey: "retry" };
    // SQL rejects a second admission and the caller releases the provisional reservation.
    expect(await admission.create(editor, retry)).toMatchObject({
      kind: "rejected",
      reason: "PREVIEW_BUSY",
    });
    expect(releaseCount).toBe(1);
    const claim = {
      ...receipt.generation.source,
      id: receipt.generation.id,
      run: "fixture-run",
      credentialHash: "c".repeat(64),
      now: clock.now(),
    };
    expect(await repository.preview.claimPreview(claim)).not.toBeNull();
    expect(
      await repository.preview.finalizePreview({ ...claim, output: previewOutput, media: [] }),
    ).toBe(true);
    const existing = await repository.preview.currentPreview(target.id, clock.now());
    expect(existing).toMatchObject({ id: receipt.generation.id, state: "ready" });
    reserve = async () => ({ reason: "PREVIEW_BUSY" });
    expect(await admission.create(editor, retry)).toMatchObject({
      kind: "rejected",
      reason: "PREVIEW_BUSY",
    });
    expect(await repository.preview.currentPreview(target.id, clock.now())).toEqual(existing);
    expect(await admission.create(editor, { ...request, expectedRevision: 2 })).toMatchObject({
      kind: "replayed",
    });

    // A route occupied by another publication is refused before any replacement.
    await repository.publish(publish(other.id, 1, 6));
    await sql.run("delete from preview_execution_slot");
    const candidate = await previewInput(
      repository,
      { ...target, draft: { ...target.draft, revision: 2 } },
      "conflict",
    );
    expect(
      await repository.preview.admitPreview({
        ...candidate,
        path: "/blog/other",
        actorId: admin.id,
      }),
    ).toEqual({ kind: "rejected", reason: "PREVIEW_ROUTE_CONFLICT" });
  },
);

for (const change of ["public version", "preview epoch"] as const) {
  contract(
    `preview capture fails without recapture when the ${change} changes between pages`,
    async (runtime, expect) => {
      const { repository, sql, target, reads } = await openPreview(runtime);
      await seedMedia(sql, "image");
      const first = entry("first", "posts", {
        slug: "aaa",
        updatedAt: 1,
        blocks: [heroBlock("hero", "image")],
      });
      await repository.create({ entry: first, mediaReferences: [] });
      await repository.publish(publish(first.id, 1, 10, "first-published"));
      const author = entry("author", "testimonials", { updatedAt: 1 });
      await repository.create({ entry: author, mediaReferences: [] });
      await repository.publish(publish(author.id, 1, 12, "author-published"));
      const before = await repository.preview.previewCaptureFence();
      const input = await previewInput(repository, target, "race");
      const receipt = await repository.preview.admitPreview({
        ...input,
        projection: { ...input.projection, fields: { author: author.id } },
        referenceCandidate: {
          blockKeys: [],
          references: [
            {
              purpose: "reference",
              sourceKey: "$fields",
              area: "fields",
              pointer: "/author",
              targetId: author.id,
              delivered: true,
              models: ["testimonials"],
            },
          ],
        },
      });
      if (receipt.kind !== "admitted") throw new Error("Expected an admitted preview.");
      const memory = memoryInput();
      let readsOfPages = 0;
      reads.reset();
      const result = await capturePreviewInput(
        {
          preview: repository.preview,
          clock,
          store: memory.store,
          content: {
            async previewContextPage(input) {
              const attempt = ++readsOfPages;
              const page = await repository.preview.previewContextPage({ ...input, limit: 1 });
              if (attempt === 1) {
                if (change === "public version")
                  await repository.publish(publish(author.id, 1, 20, "author-updated"));
                else
                  await repository.applyConfigurationSyncBlockMigrations({
                    migratedAt: unixMilliseconds(20),
                    modelKey: first.model.key,
                    units: [
                      {
                        entryId: first.id,
                        snapshots: [
                          {
                            snapshotId: "first-published",
                            state: "published",
                            expectedRevision: 1,
                            revision: 1,
                            references: [],
                            blocks: [
                              {
                                key: "hero",
                                schemaVersion: 2,
                                expectedSchemaVersion: 1,
                                data: { title: "migrated" },
                                settings: {},
                              },
                            ],
                          },
                        ],
                      },
                    ],
                  });
              }
              return page;
            },
          },
        },
        receipt.generation,
      );
      expect(result).toEqual({ kind: "failed", reason: "PREVIEW_CONTEXT_CHANGED" });
      expect(readsOfPages).toBe(2);
      expect(memory.seals).toBe(0);
      expect(await repository.preview.currentPreview(target.id, clock.now())).toMatchObject({
        state: "failed",
        reason: "PREVIEW_CONTEXT_CHANGED",
      });
      const after = await repository.preview.previewCaptureFence();
      expect(after.publicVersion).toBe(
        before.publicVersion + (change === "public version" ? 1 : 0),
      );
      expect(after.captureEpoch).toBe(before.captureEpoch + (change === "preview epoch" ? 1 : 0));
      expect(await sql.all("select * from preview_execution_slot")).toEqual([]);
    },
  );
}
