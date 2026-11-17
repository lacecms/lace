import type { Clock } from "../ports/infrastructure.js";
import type { PreviewInputStore, PreviewMaintenancePort, PreviewRunner } from "../ports/preview.js";

const DEADLINES_PER_PASS = 3;
const CLEANUPS_PER_PASS = 2;
const OBJECTS_PER_PURGE = 64;
const HISTORY_PER_PASS = 16;

export interface PreviewMaintenanceDependencies {
  readonly repository: PreviewMaintenancePort;
  readonly clock: Clock;
  readonly store: Pick<PreviewInputStore, "purge">;
  readonly runner: Pick<PreviewRunner, "stop">;
}

export interface PreviewMaintenanceResult {
  readonly settled: number;
  readonly executor: "idle" | "stopped" | "unconfirmed";
  readonly namespacesPurged: number;
  readonly tombstonesPurged: number;
  readonly failures: number;
}

/** Reconcile the same generation after restart. An unknown stop result retains its slot. */
export async function reconcilePreviewExecutor({
  repository,
  clock,
  runner,
}: PreviewMaintenanceDependencies): Promise<PreviewMaintenanceResult["executor"]> {
  const pending = await repository.previewExecutorToStop();
  if (pending === null) return "idle";
  if ((await runner.stop(pending)) !== "stopped") return "unconfirmed";
  return (await repository.confirmPreviewExecutorStopped(pending.id, clock.now()))
    ? "stopped"
    : "idle";
}

/** Performs one bounded pass. Failures leave durable work for the next pass. */
export async function maintainPreviews(
  deps: PreviewMaintenanceDependencies,
): Promise<PreviewMaintenanceResult> {
  const { repository, clock, store } = deps;
  let settled = 0;
  let namespacesPurged = 0;
  let tombstonesPurged = 0;
  let executor: PreviewMaintenanceResult["executor"] = "unconfirmed";
  let failures = 0;
  async function attempt(action: () => Promise<void>) {
    try {
      await action();
    } catch {
      failures++;
    }
  }
  await attempt(async () => {
    for (const id of await repository.duePreviewDeadlines(clock.now(), DEADLINES_PER_PASS)) {
      await attempt(async () => {
        if (await repository.settlePreviewDeadline(id, clock.now())) settled++;
      });
    }
  });
  await attempt(async () => {
    executor = await reconcilePreviewExecutor(deps);
  });
  await attempt(async () => {
    for (const item of await repository.previewCleanup(clock.now(), CLEANUPS_PER_PASS)) {
      await attempt(async () => {
        if (
          (await store.purge(item.id, item.scope, OBJECTS_PER_PURGE)) === "empty" &&
          (await repository.recordPreviewPurged(item, clock.now()))
        )
          namespacesPurged++;
      });
    }
  });
  await attempt(async () => {
    tombstonesPurged = await repository.purgePreviewHistory(clock.now(), HISTORY_PER_PASS);
  });
  return { settled, executor, namespacesPurged, tombstonesPurged, failures };
}
