// @ts-nocheck
// TODO(rf2): Type legacy command fixtures, filesystem helpers and recorded adapter calls.
import { readFile, writeFile, chmod, lstat } from "node:fs/promises";
import { join } from "node:path";
import { expect, it } from "vitest";
import { pair, snapshot } from "../test-support/upgrade-fixtures.ts";
import { applyUpgrade } from "./upgrade-apply.js";
import { readUpgradeManifest, upgradeHash } from "./upgrade-input.js";
import { loadOperation } from "./upgrade-journal.js";

it("applies managed additions/replacements/removals, preserves ownership/local edits and publishes manifest last", async () => {
  const options = await pair(
    {
      compose: "old",
      removed: "old",
      same: "template",
      custom: { bytes: "user", user: true },
      "site/index": { bytes: "source", user: true },
      "lace.config.ts": { bytes: "config", user: true },
    },
    {
      compose: "new",
      same: "template",
      "new-dir/added": "new",
      custom: "target attempts ownership",
      "site/index": { bytes: "new source", user: true },
      "lace.config.ts": { bytes: "new config", user: true },
    },
  );
  await chmod(join(options.project, "compose"), 0o755);
  await writeFile(join(options.project, "same"), "local edit");
  await writeFile(join(options.project, "site/untracked"), "extra source");
  const targetBefore = await snapshot(options.template);
  const manifestBefore = await readFile(join(options.project, ".lace/manifest.json"));
  const result = await applyUpgrade({
    ...options,
    checkpoint: async (point) => {
      if (point === "before-manifest")
        expect(await readFile(join(options.project, ".lace/manifest.json"))).toEqual(
          manifestBefore,
        );
    },
  });
  expect(result.status).toBe("applied");
  expect(await readFile(join(options.project, "compose"), "utf8")).toBe("new");
  expect((await lstat(join(options.project, "compose"))).mode & 0o777).toBe(0o755);
  expect(await readFile(join(options.project, "new-dir/added"), "utf8")).toBe("new");
  await expect(lstat(join(options.project, "removed"))).rejects.toMatchObject({ code: "ENOENT" });
  for (const [path, value] of [
    ["same", "local edit"],
    ["custom", "user"],
    ["site/index", "source"],
    ["site/untracked", "extra source"],
    ["lace.config.ts", "config"],
  ])
    expect(await readFile(join(options.project, path), "utf8")).toBe(value);
  const manifest = await readUpgradeManifest(options.project);
  expect(manifest.templateVersion).toBe("2");
  expect(manifest.files.custom).toEqual({ owner: "user" });
  expect(manifest.files.same.sha256).toBe(upgradeHash(Buffer.from("template")));
  expect(await snapshot(options.template)).toEqual(targetBefore);
  const before = await snapshot(options.project);
  expect((await applyUpgrade(options)).status).toBe("already-current");
  expect(await snapshot(options.project)).toEqual(before);
});

it("refuses changed working bytes before mutation and retains recovery records", async () => {
  const options = await pair({ file: "old" }, { file: "new" });
  await expect(
    applyUpgrade({
      ...options,
      checkpoint: async (point) => {
        if (point === "before-file") await writeFile(join(options.project, "file"), "unexpected");
      },
    }),
  ).rejects.toThrow("Unexpected file bytes");
  expect(await readFile(join(options.project, "file"), "utf8")).toBe("unexpected");
  expect((await readUpgradeManifest(options.project)).templateVersion).toBe("1");
  expect((await loadOperation(options.project)).pointer.phase).toBe("applying");
});
it("conflicted apply changes only conflict/recovery metadata", async () => {
  const options = await pair({ compose: "old", safe: "old" }, { compose: "new", safe: "new" });
  await writeFile(join(options.project, "compose"), "local");
  const before = await snapshot(options.project, false);
  expect((await applyUpgrade(options)).status).toBe("conflicts");
  expect(await snapshot(options.project, false)).toEqual(before);
  expect(await loadOperation(options.project)).toBeNull();
});
