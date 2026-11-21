import {
  mediaId,
  PREVIEW_EXECUTION_MS,
  PREVIEW_OVERALL_MS,
  PREVIEW_READY_MS,
  unixMilliseconds,
} from "@lacecms/domain";
import { registerContract, save, seedMedia } from "../shared.js";
import type { RepositoryContractCase } from "../shared.js";
import {
  beginPreview,
  openPreview,
  previewInput,
  previewManifest,
  previewOutput,
} from "./fixtures.js";

export const cases: RepositoryContractCase[] = [];
const contract = registerContract(cases);
const time = unixMilliseconds;

contract(
  "preview execution fences claims and finalization while retaining the saved revision",
  async (runtime, expect) => {
    const { repository, reopen, target, sql } = await openPreview(runtime);
    await seedMedia(sql, "used");
    await seedMedia(sql, "only-captured");
    const input = await previewInput(repository, target, "execute");
    const receipt = await repository.preview.admitPreview(input);
    expect(receipt.kind).toBe("admitted");
    await repository.saveCompleteDraft(save(target.id, 1, 105, { fields: { text: "new" } }));
    expect(await repository.preview.capturedPreviewTarget(input.id)).toMatchObject({
      fields: { text: "saved" },
    });
    expect(
      await repository.preview.trackPreviewMedia(input.id, [mediaId("only-captured")], time(110)),
    ).toBe(true);
    expect(await repository.preview.sealPreviewInput(input.id, previewManifest, time(111))).toBe(
      true,
    );
    const claim = {
      id: input.id,
      executor: "fixture",
      commit: input.source.commit,
      run: "run",
      credentialHash: "c".repeat(64),
      now: time(120),
    };
    expect(await repository.preview.claimPreview({ ...claim, commit: "f".repeat(40) })).toBeNull();
    const contenders = await Promise.all([
      repository.preview.claimPreview(claim),
      reopen().preview.claimPreview({ ...claim, run: "duplicate" }),
    ]);
    expect(contenders.filter(Boolean)).toHaveLength(1);
    const granted = contenders[0] ? claim : { ...claim, run: "duplicate" };
    expect(contenders.find(Boolean)).toMatchObject({
      generation: { revision: 1, state: "running" },
      input: previewManifest,
      deadline: 120 + PREVIEW_EXECUTION_MS,
    });
    expect(
      await repository.preview.runningPreview({ ...granted, credentialHash: "d".repeat(64) }),
    ).toBeNull();
    expect(await repository.preview.runningPreview(granted)).toMatchObject({
      generation: { revision: 1 },
    });
    const completion = {
      ...granted,
      output: previewOutput,
      media: [mediaId("used")],
      now: time(150),
    };
    expect(await repository.preview.finalizePreview({ ...completion, run: "foreign" })).toBe(false);
    expect(
      await repository.preview.finalizePreview({ ...completion, media: [mediaId("unavailable")] }),
    ).toBe(false);
    expect(await repository.preview.readyPreview(input.id, time(150))).toBeNull();
    expect(await repository.preview.finalizePreview(completion)).toBe(true);
    expect(await repository.preview.finalizePreview({ ...completion, now: time(160) })).toBe(true);
    expect(
      await repository.preview.finalizePreview({
        ...completion,
        output: previewManifest,
        now: time(160),
      }),
    ).toBe(false);
    expect(await sql.all("select media_id from preview_media_dependencies")).toEqual([
      { media_id: "used" },
    ]);
    expect(await repository.preview.currentPreview(target.id, time(160))).toMatchObject({
      revision: 1,
      state: "ready",
      readyAt: 150,
      expiresAt: 150 + PREVIEW_READY_MS,
    });
    expect(await repository.preview.runningPreview(granted)).toBeNull();
    expect(
      await repository.preview.readyPreview(input.id, time(150 + PREVIEW_READY_MS - 1)),
    ).toEqual(previewOutput);
    expect(
      await repository.preview.readyPreview(input.id, time(150 + PREVIEW_READY_MS)),
    ).toBeNull();
    expect(
      await repository.preview.settlePreviewDeadline(input.id, time(150 + PREVIEW_READY_MS)),
    ).toBe(true);
    expect(
      await repository.preview.currentPreview(target.id, time(150 + PREVIEW_READY_MS)),
    ).toMatchObject({ state: "expired" });
  },
);

contract(
  "preview expiration refuses late work and keeps physical capacity reserved",
  async (runtime, expect) => {
    const { repository, target, other, sql } = await openPreview(runtime);
    const { input, claim } = await beginPreview(repository, target, "timeout");
    const lateStart = input.now + 8 * 60_000;
    const deadline = input.now + PREVIEW_OVERALL_MS;
    expect(await repository.preview.claimPreview({ ...claim, now: time(lateStart) })).toMatchObject(
      { deadline },
    );
    const late = { ...claim, now: time(deadline) };
    expect(await repository.preview.runningPreview(late)).toBeNull();
    expect(
      await repository.preview.finalizePreview({ ...late, output: previewOutput, media: [] }),
    ).toBe(false);
    expect(await repository.preview.settlePreviewDeadline(input.id, late.now)).toBe(true);
    expect(await repository.preview.currentPreview(target.id, late.now)).toMatchObject({
      state: "timed_out",
      reason: "PREVIEW_TIMED_OUT",
    });
    expect(await repository.preview.readyPreview(input.id, late.now)).toBeNull();
    expect(
      await repository.preview.admitPreview(
        await previewInput(repository, other, "busy", deadline),
      ),
    ).toEqual({ kind: "rejected", reason: "PREVIEW_BUSY" });
    expect(await sql.get("select revoked_at from preview_runner_credentials")).toEqual({
      revoked_at: deadline,
    });
  },
);
