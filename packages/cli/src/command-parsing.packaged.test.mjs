import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { expect, test } from "vitest";

test.each([
  ["doctor"],
  ["cloudflare", "preflight"],
  ["upgrade"],
  ["add", "block"],
  ["import"],
  ["db", "migrate"],
  ["unrecognized"],
])("invalid JSON and extra help remain sanitized: %s", (...command) => {
  const bin = resolve(import.meta.dirname, "../dist/bin.js");
  const result = spawnSync(
    process.execPath,
    [bin, ...command, "--help", "secret-sentinel", "--json"],
    { encoding: "utf8" },
  );
  expect(result.status).not.toBe(0);
  expect(result.stderr).not.toContain("secret-sentinel");
  expect(result.stdout).not.toContain("secret-sentinel");
  expect(JSON.parse(result.stdout)).toMatchObject({ ok: false });
});
