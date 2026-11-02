import { mkdtemp, mkdir, writeFile, rm, readFile, realpath, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { execFileSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";
import { planUpgrade, presentUpgradePlan, unifiedUpgradeDiff } from "../dist/upgrade.js";
import { upgradeHash } from "../dist/upgrade-input.js";

const roots = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});
async function directory() {
  const path = await realpath(await mkdtemp(join(tmpdir(), "lace-plan-")));
  roots.push(path);
  return path;
}
async function project(files, version = "1.0.0") {
  const root = await directory();
  const inventory = {};
  for (const [path, value] of Object.entries(files)) {
    const bytes = Buffer.from(value.bytes);
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), bytes);
    inventory[path] = value.user
      ? { owner: "user" }
      : { owner: "managed", sha256: upgradeHash(bytes) };
  }
  await mkdir(join(root, ".lace"));
  await writeFile(
    join(root, ".lace/manifest.json"),
    JSON.stringify({ schemaVersion: 1, templateVersion: version, files: inventory }),
  );
  return root;
}
const file = (bytes) => ({ bytes });
const user = (bytes) => ({ bytes, user: true });
async function pair(before, after) {
  return { project: await project(before), template: await project(after, "2.0.0") };
}
const decision = (plan, path) => plan.decisions.find((item) => item.path === path);

describe("upgrade decisions", () => {
  it("refuses case aliases across manifests rather than bypassing user ownership", async () => {
    const options = await pair({ custom: user("old") }, { CUSTOM: file("new") });
    await expect(planUpgrade(options)).rejects.toThrow("case-aliased");
  });
  it("plans dependency/image replacements, additions and removals", async () => {
    const options = await pair(
      {
        "package.json": file('{"dependencies":{"@lacecms/cli":"1"}}\n'),
        "docker-compose.yml": file("image: lace:1\n"),
        obsolete: file("old\n"),
      },
      {
        "package.json": file('{"dependencies":{"@lacecms/cli":"2"}}\n'),
        "docker-compose.yml": file("image: lace:2\n"),
        new: file("new\n"),
      },
    );
    const plan = await planUpgrade(options);
    expect(plan.decisions.map(({ path, action }) => [path, action])).toEqual([
      ["docker-compose.yml", "replace"],
      ["new", "add"],
      ["obsolete", "remove"],
      ["package.json", "replace"],
    ]);
    expect(plan.changes).toBe(4);
    expect(plan.conflicts).toBe(0);
    expect(decision(plan, "new").diff).toContain("--- /dev/null");
    expect(decision(plan, "obsolete").diff).toContain("+++ /dev/null");
  });
  it("conflicts on local modifications, deletion, removed edits and new collisions", async () => {
    const options = await pair(
      { compose: file("old"), missing: file("old"), removed: file("old") },
      { compose: file("next"), missing: file("next"), new: file("next") },
    );
    await writeFile(join(options.project, "compose"), "local");
    await writeFile(join(options.project, "removed"), "local");
    await rm(join(options.project, "missing"));
    await writeFile(join(options.project, "new"), "next");
    const plan = await planUpgrade(options);
    expect(plan.conflicts).toBe(4);
    expect(plan.changes).toBe(0);
    expect(decision(plan, "compose").diff).toContain("-local\n");
    expect(decision(plan, "missing").reason).toBe("managed-file-missing");
    expect(decision(plan, "new").reason).toBe("untracked-path-exists");
    expect(await readFile(join(options.project, "compose"), "utf8")).toBe("local");
  });
  it("keeps local edits/deletions when template is unchanged and accepts already-target bytes", async () => {
    const options = await pair(
      { edited: file("old"), deleted: file("old"), updated: file("old"), removed: file("old") },
      { edited: file("old"), deleted: file("old"), updated: file("next") },
    );
    await writeFile(join(options.project, "edited"), "local");
    await rm(join(options.project, "deleted"));
    await writeFile(join(options.project, "updated"), "next");
    await rm(join(options.project, "removed"));
    const plan = await planUpgrade(options);
    expect(decision(plan, "edited").action).toBe("preserve");
    expect(decision(plan, "deleted").action).toBe("preserve");
    expect(decision(plan, "updated").action).toBe("current");
    expect(decision(plan, "removed").action).toBe("current");
    expect(plan.changes).toBe(0);
    expect(plan.conflicts).toBe(0);
  });
  it("never reads user source and preserves prior user ownership", async () => {
    const options = await pair(
      {
        "site/source": user("old"),
        "lace.config.ts": user("old"),
        custom: user("old"),
        "retired-user": user("old"),
      },
      {
        "site/source": user("next"),
        "lace.config.ts": user("next"),
        custom: file("next"),
        "new-user": user("new"),
      },
    );
    await rm(join(options.project, "site/source"));
    await symlink("/does-not-exist", join(options.project, "site/source"));
    await writeFile(join(options.project, "lace.config.ts"), "throw new Error('Do not evaluate')");
    const plan = await planUpgrade(options);
    expect(
      plan.decisions.every(
        ({ action, diff, currentHash }) =>
          action === "preserve" && diff === null && currentHash === null,
      ),
    ).toBe(true);
  });
  it("conflicts when a managed file becomes user-owned", async () => {
    const options = await pair({ custom: file("old") }, { custom: user("next") });
    expect(decision(await planUpgrade(options), "custom")).toMatchObject({
      action: "conflict",
      reason: "ownership-changed",
      diff: null,
    });
  });
  it("keeps human and JSON plans byte-stable, including unchanged manifests", async () => {
    const options = await pair(
      { b: file("old"), a: file("same") },
      { b: file("next"), a: file("same") },
    );
    const manifestBefore = await readFile(join(options.project, ".lace/manifest.json"));
    const first = await planUpgrade(options);
    const second = await planUpgrade(options);
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    expect(presentUpgradePlan(first)).toBe(presentUpgradePlan(second));
    expect(await readFile(join(options.project, ".lace/manifest.json"))).toEqual(manifestBefore);
    expect(decision(first, "a").action).toBe("current");
  });
});

describe("unified upgrade diffs", () => {
  it("retains trailing spaces in human diff output", async () => {
    const plan = await planUpgrade(await pair({ file: file("old\n") }, { file: file("new   \n") }));
    expect(presentUpgradePlan(plan)).toContain("+new   ");
  });
  it("represents missing final newlines on both sides", () => {
    expect(unifiedUpgradeDiff("file", Buffer.from("old"), Buffer.from("new"))).toBe(
      "--- a/file\n+++ b/file\n@@ -1,1 +1,1 @@\n-old\n\\ No newline at end of file\n+new\n\\ No newline at end of file\n",
    );
  });
  it("handles empty files, newline-only files and binary data", () => {
    expect(unifiedUpgradeDiff("f", undefined, Buffer.from(""))).toBe("--- /dev/null\n+++ b/f\n");
    expect(unifiedUpgradeDiff("f", Buffer.from(""), Buffer.from("\n"))).toContain(
      "@@ -0,0 +1,1 @@\n+\n",
    );
    expect(unifiedUpgradeDiff("f", Buffer.from("same"), Buffer.from("same"))).toBeNull();
    expect(unifiedUpgradeDiff("f", Buffer.from([0xff]), Buffer.from("new"))).toBe(
      "Binary files a/f and b/f differ\n",
    );
    expect(unifiedUpgradeDiff("f", Buffer.from([0]), undefined)).toContain("Binary files");
  });
  it("produces patches that reconstruct exact proposed text bytes", async () => {
    const root = await directory();
    const examples = [
      ["old\n", "new\n"],
      ["old", "new"],
      ["a\nb\n", "a\nb"],
      ["", "one\n"],
      ["one\n", ""],
      ["old\r\n", "new\r\n"],
      ["é\n", "日本語\n"],
    ];
    for (const [before, after] of examples) {
      await writeFile(join(root, "file"), before);
      await writeFile(
        join(root, "change.patch"),
        unifiedUpgradeDiff("file", Buffer.from(before), Buffer.from(after)),
      );
      execFileSync("git", ["apply", "--unsafe-paths", "change.patch"], { cwd: root });
      expect(await readFile(join(root, "file"), "utf8")).toBe(after);
    }
  });
});
