import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { expect, test } from "vitest";

const bin = resolve(import.meta.dirname, "../dist/bin.js");
const commands = [
  [],
  ["db", "migrate"],
  ["content", "sync"],
  ["auth", "bootstrap"],
  ["env", "prepare"],
  ["doctor"],
  ["cloudflare", "preflight"],
  ["upgrade"],
  ["add", "block"],
  ["import"],
];

test.each(commands.flatMap((command) => ["--help", "-h"].map((flag) => [...command, flag])))(
  "help contract: %s",
  (...argv) => {
    const { status, stdout, stderr, error } = spawnSync(process.execPath, [bin, ...argv], {
      encoding: "utf8",
    });
    expect(error).toBeUndefined();
    expect({ status, stdout, stderr }).toMatchSnapshot();
  },
);
