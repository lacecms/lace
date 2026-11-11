// The test tsconfig does not include the ambient declaration unless referenced.
// oxlint-disable-next-line typescript/triple-slash-reference
/// <reference path="./doctor-semver.d.ts" />

import { expect, test } from "vitest";
import { parseArguments } from "./index.js";
import { parseDoctorArguments } from "./doctor-report.js";
import { parsePreflightArguments } from "./preflight-options.js";
import { parseUpgradeArguments } from "./upgrade-command.js";
import { parseAddBlockArguments } from "./blocks-command.js";
import { parseImportArguments } from "./import-command.js";

type ParserCase = {
  parse: (args: string[]) => unknown;
  valid: string[];
  validResult: unknown;
  defaults: string[];
  defaultResult: unknown;
  valuedFlag: string;
};

const cases: ParserCase[] = [
  {
    parse: parseArguments,
    valid: ["--json", "content", "sync", "--check"],
    validResult: { check: true, command: "content sync", json: true, target: "node" },
    defaults: ["db", "migrate"],
    defaultResult: { check: false, command: "db migrate", json: false, target: "node" },
    valuedFlag: "--target",
  },
  {
    parse: parseDoctorArguments,
    valid: ["--stage", "setup", "--target", "node"],
    validResult: { json: false, mode: "native", stage: "setup", target: "node" },
    defaults: ["--target", "node", "--stage", "ready"],
    defaultResult: { json: false, mode: "native", stage: "ready", target: "node" },
    valuedFlag: "--mode",
  },
  {
    parse: parsePreflightArguments,
    valid: ["--wrangler-auth", "oauth", "--target", "cloudflare-remote"],
    validResult: { json: false, wranglerAuth: "oauth" },
    defaults: ["--target", "cloudflare-remote", "--wrangler-auth", "token"],
    defaultResult: { json: false, wranglerAuth: "token" },
    valuedFlag: "--operator-env",
  },
  {
    parse: parseUpgradeArguments,
    valid: ["--template", "template", "--apply"],
    validResult: { action: "apply", json: false, project: process.cwd(), template: "template" },
    defaults: ["--rollback"],
    defaultResult: { action: "rollback", json: false, project: process.cwd(), template: undefined },
    valuedFlag: "--project",
  },
  {
    parse: parseAddBlockArguments,
    valid: ["hero", "--site", "web", "cta"],
    validResult: {
      all: false,
      dryRun: false,
      framework: undefined,
      json: false,
      site: "web",
      types: ["hero", "cta"],
      writeNew: false,
    },
    defaults: ["--all"],
    defaultResult: {
      all: true,
      dryRun: false,
      framework: undefined,
      json: false,
      site: "site",
      types: [],
      writeNew: false,
    },
    valuedFlag: "--site",
  },
  {
    parse: parseImportArguments,
    valid: ["--publish", "out", "--url", "https://x.test"],
    validResult: {
      directory: "out",
      dryRun: false,
      json: false,
      overwrite: false,
      publish: true,
      url: "https://x.test",
      validateOnly: false,
    },
    defaults: ["out"],
    defaultResult: {
      directory: "out",
      dryRun: false,
      json: false,
      overwrite: false,
      publish: false,
      validateOnly: false,
    },
    valuedFlag: "--url",
  },
];

test.each(cases)(
  "parser retains values, defaults and rejects malformed flags",
  ({ parse, valid, validResult, defaults, defaultResult, valuedFlag }) => {
    expect(parse(valid)).toStrictEqual(validResult);
    expect(parse(defaults)).toStrictEqual(defaultResult);
    for (const tail of [["--json", "--json"], ["--unknown"], [valuedFlag]]) {
      expect(() => parse([...defaults, ...tail])).toThrow();
    }
  },
);
