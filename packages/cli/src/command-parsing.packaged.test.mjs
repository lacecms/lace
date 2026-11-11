import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { expect, test } from "vitest";
import { parseArguments } from "../dist/index.js";
import { parseDoctorArguments } from "../dist/doctor-report.js";
import { parsePreflightArguments } from "../dist/preflight-options.js";
import { parseUpgradeArguments } from "../dist/upgrade-command.js";
import { parseAddBlockArguments } from "../dist/blocks-command.js";
import { parseImportArguments } from "../dist/import-command.js";

const cases = [
  [parseArguments, ["--json", "content", "sync", "--check"], ["db", "migrate"], "--target"],
  [
    parseDoctorArguments,
    ["--stage", "setup", "--target", "node"],
    ["--target", "node", "--stage", "ready"],
    "--mode",
  ],
  [
    parsePreflightArguments,
    ["--wrangler-auth", "oauth", "--target", "cloudflare-remote"],
    ["--target", "cloudflare-remote", "--wrangler-auth", "token"],
    "--operator-env",
  ],
  [parseUpgradeArguments, ["--template", "template", "--apply"], ["--rollback"], "--project"],
  [parseAddBlockArguments, ["hero", "--site", "web", "cta"], ["--all"], "--site"],
  [parseImportArguments, ["--publish", "out", "--url", "https://x.test"], ["out"], "--url"],
];

test.each(cases)(
  "parser retains values, defaults and rejects malformed flags",
  (parse, valid, defaults, valuedFlag) => {
    expect(parse(valid)).toMatchSnapshot();
    expect(parse(defaults)).toMatchSnapshot();
    for (const tail of [["--json", "--json"], ["--unknown"], [valuedFlag]]) {
      expect(() => parse([...defaults, ...tail])).toThrow();
    }
  },
);

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
