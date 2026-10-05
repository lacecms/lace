import { expect, test } from "vitest";
import { parseArguments } from "../dist/index.js";
import { parsePreflightArguments } from "../dist/preflight-options.js";

test("operator file requires one explicit remote target and preserves old options", () => {
  for (const words of [
    ["db", "migrate"],
    ["content", "sync"],
    ["auth", "bootstrap"],
  ]) {
    expect(
      parseArguments([...words, "--target", "cloudflare-remote", "--operator-env", "private"]),
    ).toMatchObject({ operatorEnv: "private", target: "cloudflare-remote" });
    for (const tail of [
      [],
      ["--target", "node"],
      ["--target", "cloudflare-local"],
      ["--target", "cloudflare-remote", "--operator-env", "again"],
    ])
      expect(() => parseArguments([...words, "--operator-env", "private", ...tail])).toThrow();
  }
  for (const args of [
    ["db", "migrate", "--operator-env"],
    ["db", "migrate", "--operator-env", "--json"],
    ["env", "prepare", "--target", "cloudflare-remote", "--operator-env", "private"],
  ])
    expect(() => parseArguments(args)).toThrow();
  expect(parseArguments(["db", "migrate"]).target).toBe("node");
});
test("preflight requires unique explicit target and credential choice", () => {
  const base = ["--target", "cloudflare-remote", "--wrangler-auth", "oauth"];
  expect(parsePreflightArguments([...base, "--operator-env", "private", "--json"])).toEqual({
    wranglerAuth: "oauth",
    operatorEnv: "private",
    json: true,
  });
  for (const args of [
    [],
    ["--target", "cloudflare-remote"],
    ["--target", "node", "--wrangler-auth", "oauth"],
    [...base, "--target", "cloudflare-remote"],
    [...base, "--operator-env"],
    [...base, "--json", "--json"],
    [...base, "--operator-env", "--json"],
    [...base, "--wrangler-auth", "token"],
  ])
    expect(() => parsePreflightArguments(args)).toThrow();
});
