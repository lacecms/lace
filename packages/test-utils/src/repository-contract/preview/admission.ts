import { PreviewAdmissionService } from "@lacecms/application";
import { defineCollection, defineConfig, defineGlobal } from "@lacecms/config";
import { contentEntryId, contentModelKey, unixMilliseconds } from "@lacecms/domain";
import { applySync, editor, entry, save, sequence, syncResolver } from "../shared.js";
import type { RepositoryContractCase } from "../shared.js";
import { openPreview, previewInput } from "./fixtures.js";

export const cases: readonly RepositoryContractCase[] = [
  {
    name: "preview admission requires a configured public route",
    async run(runtime, expect) {
      const config = await defineConfig({
        content: [
          defineCollection({ key: "posts", route: "/blog/:slug", version: 1 }),
          defineCollection({ key: "testimonials", version: 1 }),
          defineGlobal({ key: "settings", version: 1 }),
        ],
      });
      const { repository } = await runtime.open({
        resolveModel: syncResolver(config.runtime.content),
      });
      await applySync(repository, config.runtime.content, 10);
      for (const draft of [
        entry("post", "posts", { updatedAt: 11, slug: "post" }),
        entry("record", "testimonials", { updatedAt: 11 }),
      ]) {
        await repository.create({ entry: draft, mediaReferences: [] });
      }
      const globals = await repository.list({
        modelKey: contentModelKey("settings"),
        listFields: [],
        sort: "title",
        limit: 1,
      });
      const service = new PreviewAdmissionService({
        clock: { now: () => unixMilliseconds(100) },
        config: config.runtime,
        content: repository,
        idGenerator: { next: sequence("preview") },
        media: repository,
        preview: repository.preview,
        source: { commit: "a".repeat(40), executor: "fixture" },
      });
      const create = (id: string) =>
        service.create(editor, {
          entryId: contentEntryId(id),
          expectedRevision: 1,
          idempotencyKey: id,
        });
      for (const id of ["record", globals.items[0]!.id]) {
        await expect(create(id)).resolves.toEqual({
          kind: "rejected",
          reason: "PREVIEW_INELIGIBLE",
        });
      }
      await expect(create("post")).resolves.toMatchObject({
        kind: "admitted",
        generation: { path: "/blog/post" },
      });
    },
  },
  {
    name: "preview admission deduplicates races and guards the installation slot",
    async run(runtime, expect) {
      const { repository, reopen, target, other, reads, sql } = await openPreview(runtime);
      const input = await previewInput(repository, target, "first");
      const independent = reopen();
      reads.reset();
      const requests = await Promise.all([
        repository.preview.admitPreview(input),
        independent.preview.admitPreview({ ...input, id: "replay" }),
      ]);
      expect(requests.map((request) => request.kind).sort()).toEqual(["admitted", "replayed"]);
      const accepted = requests.find((r) => r.kind === "admitted")!;
      expect(requests).toContainEqual({ ...accepted, kind: "replayed" });
      expect(
        accepted.kind === "admitted" &&
          (await repository.preview.capturedPreviewTarget(accepted.generation.id)),
      ).toMatchObject({ title: "target", fields: { text: "saved" } });
      const newInput = await previewInput(repository, other, "other");
      expect(
        await independent.preview.admitPreview({
          ...newInput,
          idempotencyKey: input.idempotencyKey,
        }),
      ).toEqual({ kind: "rejected", reason: "PREVIEW_IDEMPOTENCY_CONFLICT" });
      expect(await independent.preview.admitPreview(newInput)).toEqual({
        kind: "rejected",
        reason: "PREVIEW_BUSY",
      });
      expect(await sql.all("select singleton_key from preview_execution_slot")).toEqual([
        { singleton_key: 1 },
      ]);
      expect(reads.snapshot().statements).toBeLessThanOrEqual(24);
    },
  },
  {
    name: "preview admission checks the exact draft and context before replacing a ready result",
    async run(runtime, expect) {
      const { repository, reopen, target, other, sql } = await openPreview(runtime);
      const input = await previewInput(repository, target, "ready");
      expect((await repository.preview.admitPreview(input)).kind).toBe("admitted");
      await sql.run(
        "update preview_generations set state='ready', expires_at=1000 where id='ready'",
      );
      await sql.run("delete from preview_execution_slot");
      const busy = await previewInput(repository, other, "other");
      const replacement = await previewInput(repository, target, "replacement");
      const race = await Promise.all([
        reopen().preview.admitPreview(busy),
        repository.preview.admitPreview(replacement),
      ]);
      expect(race.map((result) => result.kind).sort()).toEqual(["admitted", "rejected"]);
      if (race[0]?.kind === "admitted") {
        expect(
          await repository.preview.currentPreview(target.id, unixMilliseconds(200)),
        ).toMatchObject({ id: "ready", state: "ready" });
      } else {
        expect(await sql.get("select state from preview_generations where id='ready'")).toEqual({
          state: "invalidated",
        });
      }
      await sql.run("delete from preview_execution_slot");
      await repository.saveCompleteDraft(save("target", 1, 300));
      expect(
        await repository.preview.admitPreview({
          ...replacement,
          id: "stale",
          idempotencyKey: "stale",
        }),
      ).toEqual({ kind: "rejected", reason: "PREVIEW_REVISION_CONFLICT" });
      await sql.run("update preview_capture_state set epoch=epoch+1");
      expect(
        await repository.preview.admitPreview({
          ...busy,
          id: "changed",
          idempotencyKey: "changed",
        }),
      ).toEqual({ kind: "rejected", reason: "PREVIEW_CONTEXT_CHANGED" });
    },
  },
];
