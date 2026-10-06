import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

/** Status words of a feedback acceptance map. */
export const statuses = new Set(["resolved", "decision", "deferred", "open"]);

/** Rows of a map's table: `| § | feedback | status | evidence |`. */
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

/** Numbered `## N.` items of a feedback log. */
export function feedbackItems(markdown) {
  return [...markdown.matchAll(/^## (\d+)\. /gmu)].map(([, item]) => Number(item));
}

export const escape = (value) => value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");

/** Concatenated sources of acceptance scripts (all of `scripts/`, or only the named files). */
export async function acceptanceSources(workspace, names) {
  const directory = join(workspace, "scripts");
  const selected = names ?? (await readdir(directory)).filter((name) => name.endsWith(".mjs"));
  return (await Promise.all(selected.map((name) => readFile(join(directory, name), "utf8")))).join(
    "\n",
  );
}

/** Whether an acceptance source prints `stage` as a literal stage name. */
export function emitsStage(sources, stage) {
  return new RegExp(`["\`](?:Acceptance: )?${escape(stage)}["\`:]`, "u").test(sources);
}
