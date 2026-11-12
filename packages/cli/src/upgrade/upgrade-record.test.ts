// @ts-nocheck
// TODO(rf2): Type legacy command fixtures, filesystem helpers and recorded adapter calls.
import { readFile, chmod, rm } from "node:fs/promises";
import { join } from "node:path";
import { it, expect } from "vitest";
import { pair, snapshot } from "../test-support/upgrade-fixtures.ts";
import { planUpgrade } from "./upgrade.js";
import { recordUpgrade } from "./upgrade-record.js";
import { loadOperation } from "./upgrade-journal.js";

it("captures exact bytes/modes and manifests before working mutation", async () => {
  const options = await pair(
    { file: "old", removed: "remove" },
    { file: "new", "new-dir/added": "add" },
  );
  await chmod(join(options.project, "file"), 0o755);
  const before = await snapshot(options.project, false);
  const plan = await planUpgrade(options);
  const saved = await recordUpgrade(options.project, options.template, plan, null);
  expect(await snapshot(options.project, false)).toEqual(before);
  expect(saved.before.map((value) => value?.toString())).toEqual(["old", undefined, "remove"]);
  expect(saved.after.map((value) => value?.toString())).toEqual(["new", "add", undefined]);
  expect(saved.operation.entries[0].beforeMode).toBe(0o755);
  expect(saved.oldBytes.toString("base64")).toBe(before[".lace/manifest.json"]);
  expect(saved.operation.directories).toEqual(["new-dir"]);
  await rm(options.template, { recursive: true });
  expect((await loadOperation(options.project)).after[0].toString()).toBe("new");
});
it("leaves working files unchanged when staging fails", async () => {
  const options = await pair({ file: "old" }, { file: "new" });
  const before = await snapshot(options.project, false);
  await expect(
    recordUpgrade(options.project, options.template, await planUpgrade(options), null, (point) => {
      if (point === "staged-file") throw new Error("disk failure");
    }),
  ).rejects.toThrow("disk failure");
  expect(await snapshot(options.project, false)).toEqual(before);
  expect(await loadOperation(options.project)).toBeNull();
  expect(await readFile(join(options.project, "file"), "utf8")).toBe("old");
});
