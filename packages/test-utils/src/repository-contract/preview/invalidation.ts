import type { MarkMediaForDeletionInput } from "@lacecms/application";
import {
  MEDIA_DELETE_REQUESTED,
  publicationIdempotencyKey,
  publicationRequestFingerprint,
} from "@lacecms/application";
import { mediaId, unixMilliseconds } from "@lacecms/domain";
import { revertCommand, unpublishCommand } from "../entries/fixtures.js";
import {
  admin,
  applySync,
  noModels,
  publish,
  registerContract,
  save,
  seedMedia,
  seedModels,
} from "../shared.js";
import type { RepositoryContractCase } from "../shared.js";
import { beginPreview, openPreview, previewOutput } from "./fixtures.js";

export const cases: RepositoryContractCase[] = [];
const contract = registerContract(cases);
const time = unixMilliseconds;

contract(
  "preview publication invalidation commits with publication but skips replay and rollback",
  async (runtime, expect) => {
    const { repository, reopen, target } = await openPreview(runtime);
    const originalActor = publish(target.id, 1, 10).publishedBy.id;
    const original = {
      ...publish(target.id, 1, 10, "initial-publication"),
      idempotency: {
        actorId: originalActor,
        key: publicationIdempotencyKey("old-key"),
        fingerprint: publicationRequestFingerprint("old-request"),
      },
    };
    await repository.publish(original);
    const { claim } = await beginPreview(repository, target, "ready");
    await repository.preview.claimPreview(claim);
    await repository.preview.finalizePreview({
      ...claim,
      output: previewOutput,
      now: time(130),
      media: [],
    });
    expect((await reopen().publish({ ...original, publishedAt: time(140) })).outcome).toBe(
      "replayed",
    );
    await expect(repository.publish(publish(target.id, 2, 141))).rejects.toThrow();
    const failing = reopen({
      beforeMutation(checkpoint) {
        if (checkpoint === "build-outbox") throw new Error("rollback after preview invalidation");
      },
    });
    await expect(failing.publish(publish(target.id, 1, 142))).rejects.toThrow();
    expect(await repository.preview.readyPreview(claim.id, time(143))).toEqual(previewOutput);
    await repository.saveCompleteDraft(save(target.id, 1, 144));
    expect(await repository.preview.readyPreview(claim.id, time(144))).toEqual(previewOutput);
    await repository.revertDraft(revertCommand(target.id, 2, "initial-publication", 145));
    expect(await repository.preview.readyPreview(claim.id, time(145))).toEqual(previewOutput);
    await repository.unpublish(unpublishCommand(target.id, "initial-publication", 146));
    expect(await repository.preview.readyPreview(claim.id, time(146))).toEqual(previewOutput);
    const draft = await repository.load({ entryId: target.id });
    await repository.publish(publish(target.id, draft!.draft.revision, 147));
    expect(await repository.preview.readyPreview(claim.id, time(147))).toBeNull();
  },
);

contract(
  "preview finalization cannot expose output after concurrent publish or target deletion",
  async (runtime, expect) => {
    const { repository, reopen, target, other } = await openPreview(runtime);
    const { claim } = await beginPreview(repository, target, "race");
    await repository.preview.claimPreview(claim);
    const completion = { ...claim, output: previewOutput, now: time(150), media: [] };
    const [, publication] = await Promise.all([
      reopen().publish(publish(target.id, 1, 149)),
      repository.preview.finalizePreview(completion),
    ]);
    expect(typeof publication).toBe("boolean");
    expect(await repository.preview.finalizePreview(completion)).toBe(false);
    expect(await repository.preview.readyPreview(claim.id, time(151))).toBeNull();
    // A publish that won before finalization leaves the slot for executor recovery.
    const status = await repository.preview.currentPreview(target.id, time(152));
    expect(status).toMatchObject({ state: "invalidated" });
    expect(await repository.preview.runningPreview(claim)).toBeNull();
    // Use another isolated store for the entry-deletion order.
    const isolated = await openPreview(runtime);
    const deleting = await beginPreview(isolated.repository, other, "delete");
    await isolated.repository.preview.claimPreview(deleting.claim);
    await isolated.repository.delete({
      entryId: other.id,
      expectedRevision: 1,
      deletedBy: admin,
      deletedAt: time(160),
      events: [],
    });
    expect(
      await isolated.repository.preview.finalizePreview({
        ...deleting.claim,
        output: previewOutput,
        now: time(161),
        media: [],
      }),
    ).toBe(false);
    expect(await isolated.repository.preview.currentPreview(other.id, time(161))).toMatchObject({
      state: "invalidated",
    });
  },
);

contract(
  "preview copies allow media deletion and model removal without resurrecting old output",
  async (runtime, expect) => {
    const { repository, reopen, sql, target } = await openPreview(runtime);
    for (const id of ["used", "irrelevant"]) await seedMedia(sql, id);
    const { claim } = await beginPreview(repository, target, "media");
    await repository.preview.claimPreview(claim);
    await repository.preview.finalizePreview({
      ...claim,
      output: previewOutput,
      now: time(130),
      media: [mediaId("used")],
    });
    const request = (id: string): MarkMediaForDeletionInput => ({
      mediaId: mediaId(id),
      requestedAt: time(140),
      requestedBy: admin,
      events: [
        {
          type: MEDIA_DELETE_REQUESTED,
          requestedAt: 140,
          payload: { mediaId: id, requestedBy: admin.id },
        },
      ],
    });
    await repository.markForDeletion(request("irrelevant"));
    expect(await repository.preview.readyPreview(claim.id, time(141))).toEqual(previewOutput);
    await expect(
      reopen({
        beforeMutation(checkpoint) {
          if (checkpoint === "media.outbox") throw new Error("rollback after preview invalidation");
        },
      }).markForDeletion(request("used")),
    ).rejects.toThrow();
    expect(await repository.preview.readyPreview(claim.id, time(141))).toEqual(previewOutput);
    expect(await repository.markForDeletion(request("used"))).toMatchObject({ status: "deleting" });
    expect(await repository.preview.readyPreview(claim.id, time(141))).toBeNull();

    const model = await runtime.open({ resolveModel: noModels });
    await seedModels(model.sql, "posts");
    // A retained generation identity has no restrictive FK to the model.
    await model.sql.run(`insert into preview_generations
    (id,entry_id,model_key,revision,path,public_version,configuration,source_commit,executor,created_by,idempotency_key,state,created_at,overall_deadline,expires_at,output_sha256)
    values ('old','removed-entry','posts',1,'/old',0,'cfg','commit','fixture','editor','old','ready',1,500,1000,'digest')`);
    await model.sql.run("insert into preview_current values ('removed-entry','old')");
    await applySync(model.repository, [], 150);
    await seedModels(model.sql, "posts");
    expect(await model.sql.get("select state from preview_generations where id='old'")).toEqual({
      state: "invalidated",
    });
  },
);
