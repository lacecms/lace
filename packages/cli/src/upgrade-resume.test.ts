// @ts-nocheck
// TODO(rf2): Type legacy command fixtures, filesystem helpers and recorded adapter calls.
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { it, expect } from "vitest";
import { pair, snapshot } from "./upgrade-fixtures.mjs";
import { applyUpgrade } from "./upgrade-apply.js";
import { loadOperation } from "./upgrade-journal.js";
import { readUpgradeManifest, upgradeHash } from "./upgrade-input.js";

it.each(["journal-published", "after-file", "before-manifest", "after-manifest"])(
  "resumes an interrupted apply at %s",
  async (boundary) => {
    const options = await pair({ a: "old", z: "remove" }, { a: "new", "dir/add": "add" });
    let failed = false;
    await expect(
      applyUpgrade({
        ...options,
        checkpoint: (point) => {
          if (!failed && point === boundary) {
            failed = true;
            throw new Error("interrupted");
          }
        },
      }),
    ).rejects.toThrow();
    const saved = await loadOperation(options.project);
    expect(saved.pointer.phase).toBe("applying");
    expect((await readUpgradeManifest(options.project)).templateVersion).toBe(
      boundary === "after-manifest" ? "2" : "1",
    );
    expect((await applyUpgrade(options)).status).toBe("resumed");
    expect((await loadOperation(options.project)).pointer).toEqual({
      ...saved.pointer,
      phase: "applied",
    });
    expect(await readFile(join(options.project, "a"), "utf8")).toBe("new");
    expect(await readFile(join(options.project, "dir/add"), "utf8")).toBe("add");
    const complete = await snapshot(options.project);
    expect((await applyUpgrade(options)).status).toBe("already-current");
    expect(await snapshot(options.project)).toEqual(complete);
  },
);
it("rejects a different target and unexpected working edits during recovery", async () => {
  const options = await pair({ a: "old", b: "old" }, { a: "new", b: "new" });
  await expect(
    applyUpgrade({
      ...options,
      checkpoint: (point) => {
        if (point === "after-file") throw new Error("stop");
      },
    }),
  ).rejects.toThrow();
  await writeFile(join(options.project, "b"), "later edit");
  const before = await snapshot(options.project);
  await expect(applyUpgrade(options)).rejects.toThrow("Unexpected file bytes");
  expect(await snapshot(options.project)).toEqual(before);
  await writeFile(join(options.project, "b"), "old");
  const location = join(options.template, ".lace/manifest.json");
  const metadata = JSON.parse(await readFile(location, "utf8"));
  await writeFile(join(options.template, "b"), "different");
  metadata.files.b.sha256 = upgradeHash(Buffer.from("different"));
  await writeFile(location, JSON.stringify(metadata));
  await expect(applyUpgrade(options)).rejects.toThrow("differs from the pending");
});
it("checks completed working bytes again immediately before manifest rename", async () => {
  const options = await pair({ a: "old" }, { a: "new" });
  await expect(
    applyUpgrade({
      ...options,
      checkpoint: async (point) => {
        if (point === "temporary-manifest") await writeFile(join(options.project, "a"), "old");
      },
    }),
  ).rejects.toThrow("Operation incomplete");
  expect((await readUpgradeManifest(options.project)).templateVersion).toBe("1");
  expect((await applyUpgrade(options)).status).toBe("resumed");
});
it("refuses target changes or unexpected manifest edits before publication", async () => {
  for (const changeTarget of [false, true]) {
    const options = await pair({ a: "old" }, { a: "new" });
    await expect(
      applyUpgrade({
        ...options,
        checkpoint: async (point) => {
          if (point === "before-manifest") {
            if (changeTarget) await writeFile(join(options.template, "a"), "changed target");
            else
              await writeFile(join(options.project, ".lace/manifest.json"), "unexpected manifest");
          }
        },
      }),
    ).rejects.toThrow();
    if (!changeTarget)
      expect(await readFile(join(options.project, ".lace/manifest.json"), "utf8")).toBe(
        "unexpected manifest",
      );
    else expect((await readUpgradeManifest(options.project)).templateVersion).toBe("1");
  }
});
