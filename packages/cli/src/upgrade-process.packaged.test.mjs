import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";
import { pair, snapshot } from "./upgrade-fixtures.mjs";
import { applyUpgrade } from "../dist/upgrade-apply.js";
import { rollbackUpgrade } from "../dist/upgrade-rollback.js";
import { loadOperation } from "../dist/upgrade-journal.js";

const applyModule = new URL("../dist/upgrade-apply.js", import.meta.url).href;
const rollbackModule = new URL("../dist/upgrade-rollback.js", import.meta.url).href;
const bin = fileURLToPath(new URL("../dist/bin.js", import.meta.url));
const script = `
import { applyUpgrade } from ${JSON.stringify(applyModule)};
import { rollbackUpgrade } from ${JSON.stringify(rollbackModule)};
const [options, point, path, direction] = process.argv.slice(1);
process.on("message", () => {});
const checkpoint = async (current, file) => {
  if (current === point && (!path || file === path)) {
    process.send({ stopped: true });
    await new Promise(() => {});
  }
};
await (direction === "rollback" ? rollbackUpgrade : applyUpgrade)({ ...JSON.parse(options), checkpoint });
`;
async function stoppedChild(options, point, path = "", direction = "apply") {
  const child = spawn(
    process.execPath,
    ["--input-type=module", "-e", script, JSON.stringify(options), point, path, direction],
    { stdio: ["ignore", "pipe", "pipe", "ipc"] },
  );
  let output = "";
  child.stderr.on("data", (bytes) => {
    output += bytes;
  });
  try {
    await Promise.race([
      once(child, "message"),
      once(child, "exit").then(() => {
        throw new Error(`Child exited before checkpoint: ${output}`);
      }),
      new Promise((_, reject) => {
        const timeout = setTimeout(() => reject(new Error("Checkpoint timeout")), 10_000);
        timeout.unref();
      }),
    ]);
    return child;
  } catch (error) {
    child.kill("SIGKILL");
    throw error;
  }
}
async function terminate(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited = once(child, "exit");
  child.kill("SIGKILL");
  await exited;
}
function cli(options, args, json = true) {
  return spawnSync(
    process.execPath,
    [bin, "upgrade", "--project", options.project, ...args, ...(json ? ["--json"] : [])],
    { encoding: "utf8" },
  );
}

it.each([
  ["before-journal", ""],
  ["temporary-file", "a"],
  ["after-file", "a"],
  ["after-file", "dir/add"],
  ["after-file", "z"],
  ["before-manifest", ""],
  ["temporary-manifest", ""],
  ["after-manifest", ""],
])(
  "recovers a hard-terminated process at %s %s and reports pending state read-only",
  async (point, path) => {
    const options = await pair({ a: "old", z: "remove" }, { a: "new", "dir/add": "added" });
    const original = await snapshot(options.project, false);
    const child = await stoppedChild(options, point, path);
    try {
      const beforeBusy = await snapshot(options.project);
      const busy = cli(options, ["--template", options.template, "--apply"]);
      expect(busy.status).toBe(6);
      expect(JSON.parse(busy.stdout)).toMatchObject({
        code: "UPGRADE_BUSY",
        operation: "upgrade",
        reason: expect.stringContaining("lock"),
        nextAction: expect.stringContaining("owner"),
      });
      if (point === "after-file" && path === "a") {
        const human = cli(options, ["--template", options.template, "--apply"], false);
        expect(human.status).toBe(6);
        expect(human.stderr).toContain("Operation: upgrade");
        expect(human.stderr).toContain("Recovery:");
      }
      expect(await snapshot(options.project)).toEqual(beforeBusy);
    } finally {
      await terminate(child);
    }
    const beforeReview = await snapshot(options.project);
    const review = cli(options, ["--template", options.template]);
    if (point !== "before-journal") {
      expect(review.status).toBe(6);
      expect(JSON.parse(review.stdout)).toMatchObject({
        code: "UPGRADE_RECOVERY_PENDING",
        operation: "upgrade",
        nextAction: expect.stringContaining("recorded direction"),
        recovery: { phase: "applying", path: expect.any(String) },
      });
      if (point === "after-file" && path === "a") {
        const human = cli(options, ["--template", options.template], false);
        expect(human.status).toBe(6);
        expect(human.stdout).toContain("Operation: upgrade");
        expect(human.stdout).toContain("Recovery:");
      }
    } else {
      expect(review.status).toBe(0);
      expect(await snapshot(options.project, false)).toEqual(original);
    }
    expect(await snapshot(options.project)).toEqual(beforeReview);
    const result = cli(options, ["--template", options.template, "--apply"]);
    expect(result.status, result.stdout + result.stderr).toBe(0);
    expect(JSON.parse(result.stdout).data.status).toBe(
      point === "before-journal" ? "applied" : "resumed",
    );
    expect(await readFile(join(options.project, "a"), "utf8")).toBe("new");
    expect(
      Object.keys(await snapshot(options.project)).filter((file) => file.endsWith(".tmp")),
    ).toEqual([]);
    const restored = cli(options, ["--rollback"]);
    expect(restored.status, restored.stdout).toBe(0);
    expect(await snapshot(options.project, false)).toEqual(original);
  },
  30_000,
);

it.each([
  "rollback-recorded",
  "temporary-file",
  "after-file",
  "temporary-manifest",
  "after-manifest",
])(
  "resumes a hard-terminated rollback at %s",
  async (point) => {
    const options = await pair({ a: "old", z: "remove" }, { a: "new", "dir/add": "added" });
    const original = await snapshot(options.project, false);
    await applyUpgrade(options);
    const child = await stoppedChild(options, point, "", "rollback");
    await terminate(child);
    expect((await loadOperation(options.project)).pointer.phase).toBe("rolling-back");
    await rollbackUpgrade(options);
    expect(await snapshot(options.project, false)).toEqual(original);
    expect(
      Object.keys(await snapshot(options.project)).filter((file) => file.endsWith(".tmp")),
    ).toEqual([]);
  },
  30_000,
);
