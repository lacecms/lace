import { expect, test } from "vitest";
import { assertAtomicCheckpoints, assertQueryPlanUsesIndex } from "../index.js";

test("provides reusable atomic-checkpoint and query-plan contract helpers", async () => {
  const visited: string[] = [];
  await assertAtomicCheckpoints({
    checkpoints: ["first", "second"],
    run: async (checkpoint) => {
      visited.push(checkpoint);
    },
  });
  expect(visited).toEqual(["first", "second"]);
  expect(() =>
    assertQueryPlanUsesIndex([{ detail: "USING INDEX expected_idx" }], "expected_idx"),
  ).not.toThrow();
  expect(() => assertQueryPlanUsesIndex([{ detail: "SCAN table" }], "expected_idx")).toThrow();
});
