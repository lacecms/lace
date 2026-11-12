import { randomUUID } from "node:crypto";
import { unlink } from "node:fs/promises";
import { hostname } from "node:os";
import { join } from "node:path";
import { readUpgradeFile, UpgradeError } from "./upgrade-input.js";
import { jsonBytes, parseJson, shape, writeExclusive } from "./upgrade-files.js";
import { metadataRoot } from "./upgrade-journal.js";

const lockPath = `${metadataRoot}/lock.json`;
const gatePath = `${metadataRoot}/lock-access.json`;
function busy(): never {
  throw new UpgradeError(
    "UPGRADE_BUSY",
    "Upgrade is busy or lock ownership is uncertain. Check .lace/upgrade/lock.json and lock-access.json; verify no upgrade process runs before manual lock recovery.",
  );
}

/** Short exclusive gate serializes stale-lock reclamation as well as acquisition. */
export async function acquireUpgradeLock(project: string): Promise<() => Promise<void>> {
  const owner = jsonBytes({
    schemaVersion: 1,
    pid: process.pid,
    host: hostname(),
    token: randomUUID(),
  });
  try {
    await writeExclusive(project, gatePath, owner);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") busy();
    throw error;
  }
  let acquired = false;
  try {
    const previous = await readUpgradeFile(project, lockPath);
    if (previous !== undefined) {
      let value: unknown;
      try {
        value = parseJson(previous, "Lock owner");
      } catch {
        busy();
      }
      if (
        !shape(value, ["schemaVersion", "pid", "host", "token"]) ||
        value.schemaVersion !== 1 ||
        value.host !== hostname() ||
        typeof value.pid !== "number" ||
        !Number.isSafeInteger(value.pid) ||
        value.pid <= 0 ||
        typeof value.token !== "string" ||
        !/^[0-9a-f-]{36}$/u.test(value.token)
      )
        busy();
      try {
        process.kill(value.pid, 0);
        busy();
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ESRCH") busy();
      }
      await unlink(join(project, lockPath));
    }
    await writeExclusive(project, lockPath, owner);
    acquired = true;
  } finally {
    if ((await readUpgradeFile(project, gatePath))?.equals(owner))
      await unlink(join(project, gatePath));
  }
  if (!acquired) busy();
  return async () => {
    if ((await readUpgradeFile(project, lockPath))?.equals(owner))
      await unlink(join(project, lockPath));
  };
}
