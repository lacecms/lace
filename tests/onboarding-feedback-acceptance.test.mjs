import { readFile, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";

const workspace = fileURLToPath(new URL("..", import.meta.url));
const statuses = new Set(["resolved", "decision", "deferred", "open"]);

/** Rows of the map's table: `| § | feedback | status | evidence |`. */
export function mapRows(markdown) {
  return markdown
    .split("\n")
    .map((line) => /^\|\s*(\d+)\s*\|([^|]*)\|\s*([a-z]+)\s*\|(.*)\|\s*$/u.exec(line))
    .filter((match) => match !== null)
    .map(([, item, feedback, status, evidence]) => ({
      item: Number(item),
      feedback: feedback.trim(),
      status,
      evidence: evidence.trim(),
    }));
}

/** Numbered `## N.` items of the feedback log. */
export function feedbackItems(markdown) {
  return [...markdown.matchAll(/^## (\d+)\. /gmu)].map(([, item]) => Number(item));
}

const escape = (value) => value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");

async function acceptanceSources() {
  const directory = join(workspace, "scripts");
  const names = (await readdir(directory)).filter((name) => name.endsWith(".mjs"));
  return (await Promise.all(names.map((name) => readFile(join(directory, name), "utf8")))).join(
    "\n",
  );
}

test("every onboarding feedback item maps to acceptance evidence or a decision", async () => {
  const log = await readFile(join(workspace, "docs/onboarding-feedback.md"), "utf8");
  const map = await readFile(join(workspace, "docs/onboarding-feedback-acceptance.md"), "utf8");
  const rows = mapRows(map);
  const items = feedbackItems(log);
  expect(items.length).toBeGreaterThanOrEqual(12);
  expect(rows.map((row) => row.item)).toEqual(items);
  const sources = await acceptanceSources();
  for (const row of rows) {
    expect(statuses.has(row.status), `§${row.item} status ${row.status}`).toBe(true);
    // An unresolved defect means the regressions are not accepted.
    expect(row.status, `§${row.item} is an open defect`).not.toBe("open");
    expect(row.evidence.length, `§${row.item} evidence`).toBeGreaterThan(20);
    for (const [, stage] of row.evidence.matchAll(/stage:([a-z0-9-]+)/gu))
      expect(
        new RegExp(`["\`](?:Acceptance: )?${escape(stage)}["\`:]`, "u").test(sources),
        `§${row.item} stage ${stage}`,
      ).toBe(true);
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
