import { siteBuildEvent } from "../packages/application/dist/index.js";
import { expect, test } from "vitest";
import { openProductRuntime } from "./support/cross-runtime-fixture.mjs";
import { countingD1 } from "../packages/platform-cloudflare/src/test-support/d1-test-harness.ts";
import { defineCollection, defineConfig } from "../packages/config/dist/index.js";
import { field } from "../packages/content/dist/index.js";

const config = await defineConfig({
  blocks: [],
  content: [
    defineCollection({
      key: "notes",
      version: 1,
      route: "/notes/:slug",
      blocks: [],
      fields: { cover: field.media() },
    }),
  ],
});

test.each(["node", "worker"])(
  "%s completes bounded draft detachment over authenticated HTTP",
  async (kind) => {
    let counter, db;
    const fixture = await openProductRuntime(kind, {
      config,
      instrumentD1(raw) {
        db = raw;
        counter = countingD1(raw);
        return counter.binding;
      },
    });
    try {
      const rows = (query, ...args) =>
        kind === "worker"
          ? db
              .prepare(query)
              .bind(...args)
              .all()
              .then((r) => r.results)
          : fixture.runtime.database.connection.prepare(query).all(...args);
      const peaks = {};
      for (const count of [0, 1, 2, 50, 51]) {
        const mediaId = "detach-" + count;
        const repo = fixture.runtime.repository;
        await repo.createMedia({
          id: mediaId,
          storageKey: "media/" + mediaId,
          createdBy: "owner",
          createdAt: 1,
          filename: "image.png",
          size: 1,
          width: 1,
          height: 1,
          mimeType: "image/png",
        });
        const expected = [];
        for (let i = 0; i < count; i++) {
          const slug = mediaId + "-" + i;
          const result = await fixture.call("/api/v1/admin/models/notes/entries", {
            cookie: fixture.cookies.editor,
            method: "POST",
            json: {
              title: slug,
              slug,
              fields: { cover: mediaId },
              blocks: [],
            },
          });
          expect(result.status).toBe(201);
          expected.push({ entryId: (await result.json()).id, expectedRevision: 1 });
        }
        expected.sort((a, b) => (a.entryId < b.entryId ? -1 : 1));
        const invoke = async (phase, suffix, status) => {
          await fixture.settle();
          if (counter)
            Object.assign(counter.stats, { queries: 0, maxBatchStatements: 0, maxParameters: 0 });
          const res = await fixture.call(
            "/api/v1/admin/media/" + mediaId + "?detach=drafts" + suffix,
            { method: "DELETE", cookie: fixture.cookies.editor },
          );
          const body = await res.json();
          await fixture.settle();
          expect(res.status, JSON.stringify(body)).toBe(status);
          if (counter) {
            const current = [
              counter.stats.queries,
              counter.stats.maxBatchStatements,
              counter.stats.maxParameters,
            ];
            peaks[phase] = current.map((v, i) => Math.max(v, peaks[phase]?.[i] ?? 0));
            for (const [i, max] of [50, 40, 100].entries())
              expect(current[i], phase).toBeLessThanOrEqual(max);
          }
          return body;
        };
        const entry = (owner) => "&step=entry&" + new URLSearchParams(owner);
        const active = async () => expect((await repo.loadMedia(mediaId))?.status).toBe("active");
        const events = () =>
          rows(
            "select id from outbox_events where type='media.delete.requested' and json_extract(payload_json,'$.mediaId')=?",
            mediaId,
          );
        const revisions = () =>
          rows(
            "select revision,fields_json from content_snapshots where slug like ?",
            mediaId + "-%",
          );
        if (count === 51) {
          for (const suffix of ["", entry(expected[0])])
            expect(await invoke("limit", suffix, 409)).toMatchObject({
              error: { code: "MEDIA_IN_USE" },
            });
          await active();
          expect(await revisions()).toEqual(
            Array.from({ length: 51 }, () => ({
              revision: 1,
              fields_json: JSON.stringify({ cover: mediaId }),
            })),
          );
          expect(await events()).toHaveLength(0);
          continue;
        }
        if (count) {
          expect(await invoke("admit", "", 200)).toEqual({ state: "drafts", drafts: expected });
          expect(
            await invoke("stale", entry({ ...expected[0], expectedRevision: 2 }), 409),
          ).toMatchObject({ error: { code: "CONTENT_REVISION_CONFLICT" } });
          expect(await invoke("finish in use", "&step=finish", 409)).toMatchObject({
            error: { code: "MEDIA_IN_USE" },
          });
          const completed = [];
          for (const owner of expected) {
            expect(await invoke("entry", entry(owner), 200)).toEqual({
              state: "entry-complete",
              entryId: owner.entryId,
            });
            completed.push(owner.entryId);
            await active();
            expect(
              await rows(
                "select entry_id from content_snapshots where slug like ? and revision=2 order by entry_id",
                mediaId + "-%",
              ),
            ).toEqual(completed.map((entry_id) => ({ entry_id })));
          }
          expect(await invoke("replay", entry(expected[0]), 200)).toEqual({
            state: "entry-complete",
            entryId: expected[0].entryId,
          });
          expect(await events()).toHaveLength(0);
        }
        let completedBefore;
        const processed = async () =>
          (
            await rows(
              "select count(*) as n from outbox_events where type='media.delete.requested' and processed_at is not null",
            )
          )[0].n;
        if (kind === "worker" && (count === 0 || count === 50)) {
          completedBefore = await processed();
          const actor = { id: "busy", role: "admin" };
          for (let i = 0; i < 5; i++) {
            const id = `busy-${count}-${i}`;
            await repo.createMedia({
              id,
              storageKey: id,
              createdBy: actor.id,
              createdAt: 1,
              filename: "busy.png",
              size: 1,
              mimeType: "image/png",
            });
            await repo.markForDeletion({
              mediaId: id,
              requestedAt: 1,
              requestedBy: actor,
              events: [
                {
                  type: "media.delete.requested",
                  requestedAt: 1,
                  payload: { mediaId: id, requestedBy: actor.id },
                },
              ],
            });
          }
          await repo.requestBuild({
            requestedBy: actor,
            requestedAt: 1,
            events: [
              siteBuildEvent({
                reason: "manual",
                requestedAt: 1,
                requestedBy: actor.id,
                publishedSnapshotId: null,
              }),
            ],
          });
          await db
            .prepare("update outbox_events set available_at=0 where processed_at is null")
            .run();
        }
        expect(
          await invoke(count ? "finish" : "zero", count ? "&step=finish" : "", 202),
        ).toMatchObject({ id: mediaId, status: "deleting", usageCount: 0 });
        if (kind === "worker" && (count === 0 || count === 50)) {
          expect(await processed(), `busy ${count}, measured ${JSON.stringify(peaks)}`).toBe(
            completedBefore + 2,
          );
          expect(
            (
              await rows(
                "select count(*) as n from outbox_events where type='site.build.requested' and attempts>0",
              )
            )[0].n,
          ).toBeGreaterThan(0);
        }
        expect(await revisions()).toEqual(
          Array.from({ length: count }, () => ({ revision: 2, fields_json: "{}" })),
        );
        expect(await events()).toHaveLength(1);
        expect(await invoke("finish retry", "&step=finish", 422)).toMatchObject({
          error: { code: "CONTENT_INVALID_STATE" },
        });
      }
      if (counter) console.info("Detach phase maxima (statements/batch/binds)", peaks);
    } finally {
      await fixture.close();
    }
  },
);
