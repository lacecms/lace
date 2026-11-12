// @ts-nocheck
// TODO(rf2): Type legacy command fixtures, filesystem helpers and recorded adapter calls.
import { readFile, writeFile, chmod, lstat, rm } from "node:fs/promises";
import { join } from "node:path";
import { it, expect } from "vitest";
import { pair, snapshot } from "../test-support/upgrade-fixtures.ts";
import { applyUpgrade } from "./upgrade-apply.js";
import { rollbackUpgrade } from "./upgrade-rollback.js";
import { loadOperation } from "./upgrade-journal.js";

it.each([false, true])(
  "restores exact files/permissions/manifest without original template, interrupted apply=%s",
  async (interrupted) => {
    const options = await pair(
      { a: "old", z: "removed", "site/index": { bytes: "source", user: true } },
      { a: "new", "dir/add": "added", "site/index": { bytes: "new source", user: true } },
    );
    await chmod(join(options.project, "a"), 0o755);
    const before = await snapshot(options.project, false);
    if (interrupted)
      await expect(
        applyUpgrade({
          ...options,
          checkpoint: (point) => {
            if (point === "after-file") throw new Error("stop");
          },
        }),
      ).rejects.toThrow();
    else await applyUpgrade(options);
    await rm(options.template, { recursive: true });
    expect((await rollbackUpgrade(options)).status).toBe("rolled-back");
    expect(await snapshot(options.project, false)).toEqual(before);
    expect((await lstat(join(options.project, "a"))).mode & 0o777).toBe(0o755);
    expect((await rollbackUpgrade(options)).status).toBe("already-rolled-back");
  },
);
it("refuses a later edit before any restoration", async () => {
  const options = await pair({ a: "old", b: "old" }, { a: "new", b: "new" });
  await applyUpgrade(options);
  await writeFile(join(options.project, "b"), "later edit");
  const before = await snapshot(options.project);
  await expect(rollbackUpgrade(options)).rejects.toThrow("Unexpected file bytes");
  expect(await snapshot(options.project)).toEqual(before);
  expect(await readFile(join(options.project, "a"), "utf8")).toBe("new");
});
it.each(["rollback-recorded", "after-file", "before-manifest", "after-manifest"])(
  "resumes rollback interrupted at %s",
  async (boundary) => {
    const options = await pair({ a: "old", z: "removed" }, { a: "new", "dir/add": "added" });
    const before = await snapshot(options.project, false);
    await applyUpgrade(options);
    await expect(
      rollbackUpgrade({
        ...options,
        checkpoint: (point) => {
          if (point === boundary) throw new Error("stop");
        },
      }),
    ).rejects.toThrow();
    expect((await loadOperation(options.project)).pointer.phase).toBe("rolling-back");
    await expect(applyUpgrade(options)).rejects.toThrow("Rollback is unfinished");
    await rollbackUpgrade(options);
    expect(await snapshot(options.project, false)).toEqual(before);
  },
);
it("refuses missing or corrupted recovery history", async () => {
  const options = await pair({ a: "old" }, { a: "new" });
  await expect(rollbackUpgrade(options)).rejects.toThrow("No recorded upgrade");
  await applyUpgrade(options);
  const saved = await loadOperation(options.project);
  await writeFile(
    join(options.project, `.lace/upgrade/transactions/${saved.pointer.id}/before/0`),
    "corrupt",
  );
  const before = await snapshot(options.project);
  await expect(rollbackUpgrade(options)).rejects.toThrow("corrupt");
  expect(await snapshot(options.project)).toEqual(before);
});
