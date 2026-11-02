import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";

test(
  "runtime executable resolves a fresh relative database from its working directory",
  { timeout: 30_000 },
  async () => {
    const root = await mkdtemp(join(tmpdir(), "lace-relative-migrate-"));
    try {
      const result = spawnSync(
        process.execPath,
        [fileURLToPath(new URL("../dist/migrate.js", import.meta.url))],
        {
          cwd: root,
          env: { ...process.env, LACE_DATABASE_PATH: "nested/data/lace.sqlite" },
          encoding: "utf8",
          // Bound the child separately, leaving time for assertions and cleanup.
          timeout: 25_000,
          killSignal: "SIGKILL",
        },
      );
      expect(result.error, result.error?.message ?? result.stderr).toBeUndefined();
      expect(result.status, result.stderr).toBe(0);
      expect(JSON.parse(result.stdout).length).toBeGreaterThan(0);
      expect(await readFile(join(root, "nested/data/lace.sqlite"))).toBeDefined();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  },
);
