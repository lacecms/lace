import { maintainPreviews, reconcilePreviewExecutor } from "@lacecms/application";
import type { PreviewMaintenanceDependencies } from "@lacecms/application";
import { PREVIEW_OVERALL_MS, PREVIEW_READY_MS, unixMilliseconds } from "@lacecms/domain";
import { registerContract } from "../shared.js";
import type { RepositoryContractCase } from "../shared.js";
import { beginPreview, openPreview, previewInput, previewOutput } from "./fixtures.js";

export const cases: RepositoryContractCase[] = [];
const contract = registerContract(cases);
const time = unixMilliseconds;

contract(
  "preview maintenance recovers a timed out executor and retries orphan cleanup without rebuilding",
  async (runtime, expect) => {
    const { repository, reopen, target, other, sql, reads } = await openPreview(runtime);
    const { claim, input } = await beginPreview(repository, target, "recovery");
    await repository.preview.claimPreview(claim);
    let now = input.now + PREVIEW_OVERALL_MS;
    let stopConfirmed = false;
    let storageAvailable = false;
    let deleted = false;
    let purgeAttempts = 0;
    const deps: PreviewMaintenanceDependencies = {
      repository: repository.preview,
      clock: { now: () => time(now) },
      store: {
        async purge(id, scope, limit) {
          expect({ id, scope, limit }).toEqual({ id: claim.id, scope: "all", limit: 64 });
          expect(await repository.preview.readyPreview(id, time(now))).toBeNull();
          purgeAttempts++;
          if (!storageAvailable) throw new Error("Object store unavailable");
          if (!deleted) {
            deleted = true;
            return "empty";
          }
          return "empty";
        },
      },
      runner: {
        async stop(execution) {
          expect(execution).toMatchObject({ id: claim.id, run: claim.run, state: "timed_out" });
          return stopConfirmed ? "stopped" : "unconfirmed";
        },
      },
    };
    expect(await maintainPreviews(deps)).toMatchObject({
      settled: 1,
      executor: "unconfirmed",
      namespacesPurged: 0,
      failures: 0,
    });
    expect(purgeAttempts).toBe(0);
    expect(
      await repository.preview.admitPreview(
        await previewInput(repository, other, "during-recovery", now),
      ),
    ).toMatchObject({ kind: "rejected", reason: "PREVIEW_BUSY" });
    expect(await repository.preview.confirmPreviewExecutorStopped("different", time(now))).toBe(
      false,
    );
    stopConfirmed = true;
    const restarted = { ...deps, repository: reopen().preview };
    expect(await reconcilePreviewExecutor(restarted)).toBe("stopped");
    expect(await maintainPreviews(restarted)).toMatchObject({
      executor: "idle",
      namespacesPurged: 0,
      failures: 1,
    });
    storageAvailable = true;

    const failingAck = reopen({
      beforeMutation(checkpoint) {
        if (checkpoint === "preview.cleanup")
          throw new Error("SQL unavailable before cleanup commit");
      },
    });
    expect(await maintainPreviews({ ...deps, repository: failingAck.preview })).toMatchObject({
      namespacesPurged: 0,
      failures: 1,
    });
    expect(deleted).toBe(true);
    expect(await sql.get("select output_purged_at from preview_generations")).toEqual({
      output_purged_at: null,
    });
    expect(await sql.all("select generation_id from preview_targets")).toEqual([
      { generation_id: claim.id },
    ]);
    reads.reset();
    expect(await maintainPreviews(deps)).toMatchObject({
      namespacesPurged: 1,
      tombstonesPurged: 0,
      failures: 0,
    });
    expect(reads.snapshot().statements).toBeLessThanOrEqual(50);
    expect(purgeAttempts).toBe(3);
    expect(await sql.all("select generation_id from preview_targets")).toEqual([]);
    expect(
      await repository.preview.finalizePreview({
        ...claim,
        output: previewOutput,
        media: [],
        now: time(now),
      }),
    ).toBe(false);
    expect((await repository.preview.admitPreview(input)).kind).toBe("replayed");

    now += PREVIEW_READY_MS;
    expect(await maintainPreviews(deps)).toMatchObject({
      namespacesPurged: 0,
      tombstonesPurged: 1,
    });
    expect(await sql.all("select id from preview_generations")).toEqual([]);
  },
);

contract(
  "preview maintenance keeps output ready while cleaning input and bounds deadline work",
  async (runtime, expect) => {
    const { repository, target, sql, reads } = await openPreview(runtime);
    const { claim } = await beginPreview(repository, target, "keep-output");
    await repository.preview.claimPreview(claim);
    await repository.preview.finalizePreview({
      ...claim,
      output: previewOutput,
      media: [],
      now: time(150),
    });
    const seen: string[] = [];
    const deps: PreviewMaintenanceDependencies = {
      repository: repository.preview,
      clock: { now: () => time(1_000_000) },
      store: {
        async purge(id, scope) {
          seen.push(`${id}:${scope}`);
          return "empty";
        },
      },
      runner: {
        async stop() {
          throw new Error("No execution should be stopped");
        },
      },
    };
    await sql.run(`with recursive seq(n) as (select 1 union all select n+1 from seq where n < 8)
    insert into preview_generations
    (id,entry_id,model_key,revision,path,public_version,configuration,source_commit,executor,created_by,idempotency_key,state,created_at,overall_deadline,expires_at)
    select 'archived-'||n,'entry-'||n,'home',1,'/',0,'cfg','commit','fixture','editor','key-'||n,'ready',n,n+900000,n+900000 from seq`);
    reads.reset();
    const first = await maintainPreviews(deps);
    expect(first).toMatchObject({ settled: 3, executor: "idle", namespacesPurged: 2, failures: 0 });
    expect(reads.snapshot().statements).toBeLessThanOrEqual(50);
    expect(seen).toEqual(["archived-1:all", "archived-2:all"]);
    await maintainPreviews(deps);
    await maintainPreviews(deps);
    await maintainPreviews(deps);
    await maintainPreviews(deps);
    expect(seen).toContain("keep-output:input");
    expect(await repository.preview.readyPreview(claim.id, time(1_000_000))).toEqual(previewOutput);
    expect(
      await sql.get("select input_sha256 from preview_generations where id='keep-output'"),
    ).toEqual({ input_sha256: null });
  },
);
