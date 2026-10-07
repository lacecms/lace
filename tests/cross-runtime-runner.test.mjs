import { expect, test } from "vitest";
import { runPhases, assertExecutedTests } from "../scripts/cross-runtime-verification.mjs";
test("a failed local phase fails closed and preserves unexecuted status", async () => {
  const snapshots = [];
  const executed = [];
  await expect(
    runPhases(
      [{ name: "prerequisites" }, { name: "product" }, { name: "candidate" }],
      async ({ name }) => {
        executed.push(name);
        if (name === "product") throw new Error("controlled failure");
      },
      async (report) => snapshots.push(structuredClone(report)),
    ),
  ).rejects.toThrow("controlled failure");
  expect(executed).toEqual(["prerequisites", "product"]);
  expect(snapshots.at(-1)).toEqual({
    complete: false,
    phases: [
      { name: "prerequisites", status: "passed" },
      { name: "product", status: "failed" },
      { name: "candidate", status: "not-run" },
    ],
  });
});
test("a missing prerequisite cannot claim any acceptance success", async () => {
  let final;
  await expect(
    runPhases(
      [{ name: "docker" }, { name: "product" }],
      async () => {
        throw new Error("Docker unavailable");
      },
      async (report) => {
        final = structuredClone(report);
      },
    ),
  ).rejects.toThrow("Docker unavailable");
  expect(final).toEqual({
    complete: false,
    phases: [
      { name: "docker", status: "failed" },
      { name: "product", status: "not-run" },
    ],
  });
});
test("success requires executed tests with no skips or todo cases", () => {
  const passed = {
    success: true,
    numTotalTests: 2,
    numPassedTests: 2,
    numFailedTests: 0,
    numPendingTests: 0,
    numTodoTests: 0,
  };
  expect(() => assertExecutedTests(passed)).not.toThrow();
  for (const change of [
    { numTotalTests: 0 },
    { numPendingTests: 1 },
    { numTodoTests: 1 },
    { numFailedTests: 1 },
    { success: false },
    { numPassedTests: 1 },
  ])
    expect(() => assertExecutedTests({ ...passed, ...change })).toThrow();
});
