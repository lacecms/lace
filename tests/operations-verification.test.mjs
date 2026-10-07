import { mkdtemp, rm, access, writeFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { expect, test } from "vitest";
import {
  assertLocalOperationsEnvironment,
  withOwnedDirectory,
  remoteCredentialNames,
} from "../scripts/operations-verification.mjs";
import { executeRequiredPhases } from "../scripts/security-resilience-verification.mjs";

test("operations refuses every remote credential without printing its value", () => {
  expect(() => assertLocalOperationsEnvironment({})).not.toThrow();
  for (const name of remoteCredentialNames) {
    try {
      assertLocalOperationsEnvironment({ [name]: "private-sentinel" });
      throw new Error("accepted");
    } catch (error) {
      expect(error.message).toContain("refuses");
      expect(error.message).not.toContain("private-sentinel");
    }
  }
});

test("operations phases fail closed on empty, unavailable, failed or skipped work", async () => {
  await expect(
    executeRequiredPhases(
      [],
      async () => {},
      async () => {},
    ),
  ).rejects.toThrow("empty");
  const parent = await mkdtemp(join(tmpdir(), "lace-34c-harness-"));
  try {
    const path = join(parent, "skipped.json");
    await writeFile(path, JSON.stringify({ success: true, numTotalTests: 2, numPendingTests: 1 }));
    for (const first of [
      { name: "missing" },
      { name: "failed", command: "fixture", args: [] },
      { name: "skipped", command: "fixture", args: [], testReport: path },
    ]) {
      let report;
      await expect(
        executeRequiredPhases(
          [first, { name: "later", command: "fixture", args: [] }],
          async (phase) => {
            if (phase.name === "failed") throw new Error("failure");
          },
          async (value) => {
            report = structuredClone(value);
          },
        ),
      ).rejects.toThrow();
      expect(report.complete).toBe(false);
      expect(report.phases.map((phase) => phase.status)).toEqual(["failed", "not-run"]);
    }
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

test("owned directories isolate concurrent work and clean success, failure and interruption", async () => {
  const parent = await mkdtemp(join(tmpdir(), "lace-34c-cleanup-"));
  try {
    const ordinary = join(parent, "ordinary.txt");
    await writeFile(ordinary, "keep");
    const owned = [];
    await Promise.all(
      [0, 1].map(() =>
        withOwnedDirectory(parent, async (directory) => {
          owned.push(directory);
          await writeFile(join(directory, "state"), "fixture");
        }),
      ),
    );
    expect(new Set(owned).size).toBe(2);
    const controller = new AbortController();
    await expect(
      withOwnedDirectory(parent, async (directory) => {
        owned.push(directory);
        throw new Error("failed");
      }),
    ).rejects.toThrow("failed");
    await expect(
      withOwnedDirectory(
        parent,
        async (directory, signal) => {
          owned.push(directory);
          controller.abort();
          signal.throwIfAborted();
        },
        controller.signal,
      ),
    ).rejects.toThrow();
    for (const directory of owned) await expect(access(directory)).rejects.toThrow();
    expect(await readFile(ordinary, "utf8")).toBe("keep");
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});
