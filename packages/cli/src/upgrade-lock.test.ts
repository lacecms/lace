// @ts-nocheck
// TODO(rf2): Type legacy command fixtures, filesystem helpers and recorded adapter calls.
import { writeFile, readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { hostname } from "node:os";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { project } from "./upgrade-fixtures.mjs";
import { acquireUpgradeLock } from "./upgrade-lock.js";

describe("upgrade mutation locking", () => {
  it("refuses a live competitor and releases only its owned lock", async () => {
    const root = await project({ file: "old" });
    const release = await acquireUpgradeLock(root);
    await expect(acquireUpgradeLock(root)).rejects.toMatchObject({ code: "UPGRADE_BUSY" });
    const replacement = JSON.stringify({
      schemaVersion: 1,
      pid: process.pid,
      host: hostname(),
      token: randomUUID(),
    });
    await writeFile(join(root, ".lace/upgrade/lock.json"), replacement);
    await release();
    expect(await readFile(join(root, ".lace/upgrade/lock.json"), "utf8")).toBe(replacement);
  });
  it("reclaims an established dead local owner but refuses ambiguous/gated owners", async () => {
    const root = await project({ file: "old" });
    const release = await acquireUpgradeLock(root);
    await release();
    const dead = spawnSync(process.execPath, ["-e", ""], { encoding: "utf8" }).pid;
    const location = join(root, ".lace/upgrade/lock.json");
    await writeFile(
      location,
      JSON.stringify({ schemaVersion: 1, pid: dead, host: hostname(), token: randomUUID() }),
    );
    const reclaimed = await acquireUpgradeLock(root);
    await reclaimed();
    for (const owner of [
      "broken",
      JSON.stringify({ schemaVersion: 1, pid: dead, host: "unknown-host", token: randomUUID() }),
    ]) {
      await writeFile(location, owner);
      await expect(acquireUpgradeLock(root)).rejects.toMatchObject({ code: "UPGRADE_BUSY" });
      expect(await readFile(location, "utf8")).toBe(owner);
    }
    await writeFile(join(root, ".lace/upgrade/lock-access.json"), "uncertain gate");
    await expect(acquireUpgradeLock(root)).rejects.toMatchObject({ code: "UPGRADE_BUSY" });
  });
});
