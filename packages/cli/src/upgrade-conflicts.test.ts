// @ts-nocheck
// TODO(rf2): Type legacy command fixtures, filesystem helpers and recorded adapter calls.
import { readFile, writeFile, rm, symlink } from "node:fs/promises";
import { join } from "node:path";
import { it, expect } from "vitest";
import { pair, snapshot } from "./upgrade-fixtures.mjs";
import { planUpgrade } from "./upgrade.js";
import { readTargetTemplate, readUpgradeManifest } from "./upgrade-input.js";
import { publishUpgradeConflicts } from "./upgrade-conflicts.js";

it("publishes replacement, deletion and ownership conflicts without changing working bytes", async () => {
  const options = await pair(
    { compose: "old", safe: "old", removed: "old", owned: "old" },
    { compose: "new", safe: "new", owned: { bytes: "new source", user: true } },
  );
  await writeFile(join(options.project, "compose"), "local");
  await writeFile(join(options.project, "removed"), "local");
  const before = await snapshot(options.project, false);
  const plan = await planUpgrade(options);
  const bytes = await readTargetTemplate(
    options.template,
    await readUpgradeManifest(options.template),
  );
  const path = await publishUpgradeConflicts(options.project, plan, bytes);
  expect(path).toBe(".lace/conflicts/2");
  expect(await snapshot(options.project, false)).toEqual(before);
  expect(await readFile(join(options.project, path, "proposed/compose"), "utf8")).toBe("new");
  expect(await readFile(join(options.project, path, "diffs/compose.diff"), "utf8")).toContain(
    "-local",
  );
  const index = JSON.parse(await readFile(join(options.project, path, "index.json"), "utf8"));
  expect(index.conflicts.map((item) => item.resolution).sort()).toEqual([
    "deletion",
    "ownership-transfer",
    "replacement",
  ]);
  const published = await snapshot(options.project);
  await publishUpgradeConflicts(options.project, plan, bytes);
  expect(await snapshot(options.project)).toEqual(published);
  await writeFile(join(options.project, path, "proposed/compose"), "review edit");
  await expect(publishUpgradeConflicts(options.project, plan, bytes)).rejects.toThrow(
    "preserve/move",
  );
  expect(await readFile(join(options.project, path, "proposed/compose"), "utf8")).toBe(
    "review edit",
  );
  await rm(join(options.project, path, "proposed/compose"));
  await symlink(join(options.template, "compose"), join(options.project, path, "proposed/compose"));
  await expect(publishUpgradeConflicts(options.project, plan, bytes)).rejects.toThrow("symbolic");
});
