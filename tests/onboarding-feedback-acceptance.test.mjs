import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";
import {
  acceptanceSources,
  emitsStage,
  feedbackItems,
  mapRows,
  statuses,
} from "./feedback-map.mjs";

const workspace = fileURLToPath(new URL("..", import.meta.url));
test("every onboarding feedback item maps to acceptance evidence or a decision", async () => {
  const log = await readFile(
    join(workspace, "docs/archive/step-32/onboarding-feedback.md"),
    "utf8",
  );
  const map = await readFile(
    join(workspace, "docs/archive/step-32/onboarding-feedback-acceptance.md"),
    "utf8",
  );
  const rows = mapRows(map);
  const items = feedbackItems(log);
  expect(items.length).toBeGreaterThanOrEqual(12);
  expect(rows.map((row) => row.item)).toEqual(items);
  const sources = await acceptanceSources(workspace);
  for (const row of rows) {
    expect(statuses.has(row.status), `§${row.item} status ${row.status}`).toBe(true);
    // An unresolved defect means the regressions are not accepted.
    expect(row.status, `§${row.item} is an open defect`).not.toBe("open");
    expect(row.evidence.length, `§${row.item} evidence`).toBeGreaterThan(20);
    for (const [, stage] of row.evidence.matchAll(/stage:([a-z0-9-]+)/gu))
      expect(emitsStage(sources, stage), `§${row.item} stage ${stage}`).toBe(true);
    for (const [, path] of row.evidence.matchAll(/`([^`\s]+\/[^`\s]+)`/gu))
      expect((await stat(join(workspace, path)).catch(() => null)) !== null, path).toBe(true);
  }
  expect(rows.find((row) => row.item === 11)?.status).toBe("deferred");
});

test("the map parser and stage evidence reject gaps", () => {
  expect(mapRows("| 1 | Env | resolved | stage:env-prepare |\n| x | y | z | w |")).toEqual([
    { item: 1, feedback: "Env", status: "resolved", evidence: "stage:env-prepare" },
  ]);
  expect(feedbackItems("## 1. A\n## 2. B\ntext ## 3. C\n")).toEqual([1, 2]);
});
