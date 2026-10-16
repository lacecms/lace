import { createHash, randomUUID } from "node:crypto";
import { lstat, mkdir, open, readFile, realpath, unlink } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";

export async function operationPaths(directory) {
  let target = resolve(directory);
  try {
    target = await realpath(target);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const parent = await realpath(dirname(target));
  const key = createHash("sha256")
    .update(join(parent, basename(target)))
    .digest("hex");
  return { directory: join(parent, ".locks"), lock: join(parent, ".locks", `${key}.json`), key };
}

export async function assertArtifactIdle(directory) {
  const paths = await operationPaths(directory);
  try {
    await lstat(paths.lock);
    throw new Error(
      "Release operation already active or stale lock exists; inspect the lock before retrying",
    );
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

export async function acquireArtifactLock(directory, operation) {
  await mkdir(dirname(resolve(directory)), { recursive: true });
  const paths = await operationPaths(directory);
  await mkdir(paths.directory, { recursive: true });
  if ((await lstat(paths.directory)).isSymbolicLink())
    throw new Error("Unsafe release lock directory");
  const token = randomUUID();
  let handle;
  try {
    handle = await open(paths.lock, "wx", 0o600);
  } catch (error) {
    if (error.code === "EEXIST")
      throw new Error(
        "Release operation already active or stale lock exists; inspect the lock before retrying",
      );
    throw error;
  }
  try {
    await handle.writeFile(JSON.stringify({ operation, pid: process.pid, token }));
  } finally {
    await handle.close();
  }
  return async () => {
    const value = JSON.parse(await readFile(paths.lock, "utf8"));
    if (value.token !== token) throw new Error("Release lock changed while operation was running");
    await unlink(paths.lock);
  };
}

export async function withArtifactLock(directory, operation, work) {
  const release = await acquireArtifactLock(directory, operation);
  try {
    return await work();
  } finally {
    await release();
  }
}
