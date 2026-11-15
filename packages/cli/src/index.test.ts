import { CliError } from "./shared/cli.js";
import { expect, test } from "vitest";
import { EXIT, loadEnvironment, parseArguments, presentResult } from "./index.js";

test("selects only local Node by default and parses flags in any order", () => {
  expect(parseArguments(["content", "sync", "--check", "--json"])).toEqual({
    check: true,
    command: "content sync",
    json: true,
    target: "node",
  });
  expect(parseArguments(["--target", "cloudflare-remote", "db", "migrate"]).target).toBe(
    "cloudflare-remote",
  );
  expect(() => parseArguments(["db", "migrate", "--check"])).toThrow();
  expect(() => parseArguments(["content", "sync", "--target", "production"])).toThrow();
});

test("validates target settings without repeating supplied secrets", () => {
  expect(() =>
    loadEnvironment("cloudflare-remote", { CLOUDFLARE_API_TOKEN: "sensitive-value" }),
  ).toThrow(/CLOUDFLARE_ACCOUNT_ID.*LACE_D1_DATABASE_ID/u);
  try {
    loadEnvironment("cloudflare-remote", { CLOUDFLARE_API_TOKEN: "sensitive-value" });
  } catch (error) {
    if (!(error instanceof CliError)) throw error;
    expect(error.message).not.toContain("sensitive-value");
    expect(error.exitCode).toBe(EXIT.CONFIG);
  }
});

test("formats a single JSON object", () => {
  expect(
    JSON.parse(presentResult({ ok: false, code: "CONFIG", message: "Missing." }, true)),
  ).toEqual({ ok: false, code: "CONFIG", message: "Missing." });
});
