import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { findBadTestTitles, inspectTestTitles } from "./test-title-guard.mjs";

const root = process.cwd();

test("repository test titles describe behavior", async () => {
  expect(await inspectTestTitles(root)).toEqual([]);
});

test("title guard detects declarations and static template portions", () => {
  const source = [
    'test("CE9A placeholder behavior", () => {});',
    'suite.only("LIST1 layout", () => {});',
    'describe("Step 21 build", () => {});',
    'test("34H verification", () => {});',
    'test.each`value\n${1}`("CE10 tagged case", () => {});',
    'it.concurrent.each(["SM1 data"])("SM1 case %s", () => {});',
    "test.skipIf(flag)(`behavior ${role} RF7D result`, () => {});",
    "test(`CQ1 ${`nested ${value}`} result`, () => {});",
  ].join("\n");
  expect(findBadTestTitles(source)).toEqual([
    "CE9A placeholder behavior",
    "LIST1 layout",
    "Step 21 build",
    "34H verification",
    "CE10 tagged case",
    "SM1 case %s",
    "behavior   RF7D result",
    "CQ1   result",
  ]);
});

test("title guard ignores non-title data, comments and ordinary words", () => {
  const source = [
    '// test("CE9A comment", () => {})',
    'const data = "LIST1";',
    'test("list10xyz ordinary", () => expect(data).toBe("SM1"));',
    'test.each(["CE9A"])("release %s works", () => {});',
    'test(`works ${"RF7D"} correctly`, () => {});',
    'object.test("CE9A data");',
  ].join("\n");
  expect(findBadTestTitles(source)).toEqual([]);
});

test("title guard reports the offending file and title", async () => {
  const directory = await mkdtemp(join(tmpdir(), "lace-title-guard-"));
  try {
    await mkdir(join(directory, "apps/sample/e2e"), { recursive: true });
    await writeFile(
      join(directory, "apps/sample/e2e/example.e2e.ts"),
      'test("LIST1 layout", () => {});',
    );
    expect(await inspectTestTitles(directory)).toEqual([
      "apps/sample/e2e/example.e2e.ts: LIST1 layout",
    ]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
