import type { PublishContentEntryResult } from "@lacecms/application";
import type { ExpectStatic } from "vitest";
import type { RepositoryContractRuntime } from "../shared.js";
import { resolveRoute } from "../shared.js";

type Timing = "before" | "after";
type Publish = () => Promise<PublishContentEntryResult>;

export function publicReadTimings(runtime: RepositoryContractRuntime): readonly Timing[] {
  return runtime.publicReadOverlap === "batch" ? ["after", "before"] : ["after"];
}

export async function openPublicReadOverlap(
  runtime: RepositoryContractRuntime,
  expect: ExpectStatic,
) {
  let queued: { readonly timing: Timing; readonly publish: Publish } | undefined;
  let committed: ReturnType<Publish> | undefined;
  const transactions: boolean[] = [];
  let observing = false;
  let writerCommitted = false;
  const observe = (timing: Timing) => {
    if (queued?.timing === timing) {
      const { publish } = queued;
      queued = undefined;
      committed = publish();
      return committed;
    }
  };
  const harness = await runtime.open({
    resolveModel: resolveRoute,
    afterRead: (_, inTransaction) => {
      if (observing && runtime.publicReadOverlap === "wal") {
        transactions.push(inTransaction === true);
        // better-sqlite3 executes the independent writer transaction synchronously.
        if (observe("after") !== undefined) expect(writerCommitted).toBe(true);
      }
    },
    beforeReadBatch: async () => {
      await observe("before");
    },
    afterReadBatch: async () => {
      await observe("after");
    },
  });
  if (runtime.publicReadOverlap === "wal")
    expect(await harness.sql.get("pragma journal_mode")).toEqual({ journal_mode: "wal" });

  return {
    ...harness,
    writer: harness.reopen({
      afterWrite: () => {
        writerCommitted = true;
      },
    }),
    async overlap<T>(read: () => Promise<T>, publish: Publish, timing: Timing): Promise<T> {
      if (runtime.publicReadOverlap === undefined) {
        const result = await read();
        expect(await publish()).toMatchObject({ outcome: "published" });
        return result;
      }
      harness.reads.reset();
      transactions.length = 0;
      committed = undefined;
      writerCommitted = false;
      queued = { timing, publish };
      observing = true;
      let result: T;
      try {
        result = await read();
      } finally {
        observing = false;
        queued = undefined;
      }
      expect(await committed).toMatchObject({ outcome: "published" });
      const reads = harness.reads.snapshot();
      expect(reads.statements).toBe(4);
      if (runtime.publicReadOverlap === "batch") expect(reads.batches).toBe(1);
      else expect(transactions).toEqual([true, true, true, true]);
      return result;
    },
  };
}
