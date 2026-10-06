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
const log = "docs/archive/step-33/lace-alpha-2-feedback.md";
const map = "docs/archive/step-33/alpha-2-feedback-acceptance.md";

/** The journey modules the exact-artifact (`release`) suite runs. */
const releaseJourneys = [
  "generated-project-acceptance.mjs",
  "node-browser-acceptance.mjs",
  "publication-visibility-acceptance.mjs",
  "existing-site-acceptance.mjs",
  "cloudflare-consumer-acceptance.mjs",
  "template-upgrade-acceptance.mjs",
  "block-order-acceptance.mjs",
  "weak-etag-acceptance.mjs",
  "builder-diagnostics-acceptance.mjs",
];

/** Items whose final confirmation needs a real Cloudflare account. */
const realAccountItems = [3, 4, 5];

test("every alpha.2 field-trial item maps to exact-artifact evidence", async () => {
  const markdown = await readFile(join(workspace, log), "utf8");
  const rows = mapRows(await readFile(join(workspace, map), "utf8"));
  const items = feedbackItems(markdown);
  expect(items).toEqual([1, 2, 3, 4, 5, 6]);
  // Row 7 is the log's unnumbered general diagnostics requirement.
  expect(markdown).toContain("## Общее требование к диагностике");
  expect(rows.map((row) => row.item)).toEqual([...items, 7]);
  const sources = await acceptanceSources(workspace, releaseJourneys);
  for (const row of rows) {
    expect(statuses.has(row.status), `§${row.item} status ${row.status}`).toBe(true);
    expect(row.status, `§${row.item} is an open defect`).not.toBe("open");
    expect(row.evidence.length, `§${row.item} evidence`).toBeGreaterThan(40);
    const stages = [...row.evidence.matchAll(/stage:([a-z0-9-]+)/gu)].map(([, stage]) => stage);
    expect(stages.length, `§${row.item} names no exact-artifact stage`).toBeGreaterThan(0);
    for (const stage of stages)
      expect(emitsStage(sources, stage), `§${row.item} stage ${stage}`).toBe(true);
    for (const [, path] of row.evidence.matchAll(/`([^`\s]+\/[^`\s]+)`/gu))
      expect((await stat(join(workspace, path)).catch(() => null)) !== null, path).toBe(true);
    // Local stubs never stand in for the owner's real-account confirmation.
    expect(row.evidence.includes("Owner check (34C):"), `§${row.item} owner check`).toBe(
      realAccountItems.includes(row.item),
    );
  }
});

test("stages from journeys outside the exact-artifact suite are not evidence", async () => {
  const sources = await acceptanceSources(workspace, releaseJourneys);
  expect(emitsStage(sources, "block-order-add")).toBe(true);
  expect(emitsStage(sources, "no-such-stage")).toBe(false);
});
