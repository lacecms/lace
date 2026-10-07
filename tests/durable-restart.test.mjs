import { fork } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";

const childPath = fileURLToPath(new URL("./support/durable-claim-child.mjs", import.meta.url));
function child(input) {
  const process = fork(childPath, [JSON.stringify(input)], {
    detached: true,
    execArgv: [],
    stdio: ["ignore", "ignore", "ignore", "ipc"],
  });
  const exited = new Promise((done) =>
    process.once("exit", (code, signal) => done({ code, signal })),
  );
  const message = new Promise((done, reject) => {
    process.once("message", done);
    process.once("error", reject);
    process.once("exit", (code) =>
      reject(new Error(`Durable child exited before checkpoint (${code})`)),
    );
  });
  return { process, exited, message };
}
function killGroup(pid) {
  try {
    process.kill(-pid, "SIGKILL");
  } catch (error) {
    if (error.code !== "ESRCH") throw error;
  }
}
for (const kind of ["node", "worker"]) {
  test(`${kind}: killed dispatcher claim recovers from persisted storage and rejects stale owner`, async () => {
    const root = await mkdtemp(join(tmpdir(), `lace-34b-restart-${kind}-`));
    const children = [];
    try {
      const path = join(root, kind === "node" ? "lace.sqlite" : "d1");
      const first = child({ kind, path, mode: "claim" });
      children.push(first);
      const committed = await first.message;
      expect(committed.checkpoint).toBe("claim-committed");
      expect(committed.lease.expiresAt).toBe(65001);
      process.kill(-first.process.pid, "SIGKILL");
      expect((await first.exited).signal).toBe("SIGKILL");
      const restarted = child({ kind, path, mode: "recover", oldLease: committed.lease });
      children.push(restarted);
      expect(await restarted.message).toMatchObject({
        checkpoint: "recovery-committed",
        staleDenied: true,
        status: "succeeded",
      });
      expect((await restarted.exited).code).toBe(0);
    } finally {
      for (const active of children) {
        killGroup(active.process.pid);
        await active.exited;
      }
      await rm(root, { recursive: true, force: true });
    }
  }, 30000);
}
