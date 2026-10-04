import { execFileSync, spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";

const testDirectory = dirname(fileURLToPath(import.meta.url));
const rootDirectory = join(testDirectory, "..");
const checker = join(rootDirectory, "scripts", "check-boundaries.mjs");
const fixtureDirectory = join(testDirectory, "fixtures", "boundaries");

test("allows an architecture-permitted public entry-point import", () => {
  expect(() =>
    execFileSync(process.execPath, [checker, join(fixtureDirectory, "allowed")], { stdio: "pipe" }),
  ).not.toThrow();
});

test("rejects a forbidden architecture import", () => {
  const result = spawnSync(process.execPath, [checker, join(fixtureDirectory, "forbidden")], {
    encoding: "utf8",
  });
  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain("forbidden dependency");
});

test.each([
  ["render-framework", "@lacecms/render may not import astro/runtime/server/index.js"],
  ["render-node", "@lacecms/render may not import node:fs"],
  ["render-sdk", "@lacecms/render may not import @lacecms/sdk"],
  ["sdk-framework", "@lacecms/sdk may not import react"],
  ["sdk-node", "@lacecms/sdk may not import process"],
])("rejects the %s framework-neutral import", (name, message) => {
  const result = spawnSync(
    process.execPath,
    [checker, join(fixtureDirectory, "framework-neutral", name)],
    { encoding: "utf8" },
  );
  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain(message);
});

const adminFixtureDirectory = join(testDirectory, "fixtures", "admin-structure");

function checkAdminFixture(name) {
  return spawnSync(process.execPath, [checker, join(adminFixtureDirectory, name)], {
    encoding: "utf8",
  });
}

test("allows downward admin imports through public indexes and test-only harness imports", () => {
  const result = checkAdminFixture("allowed");
  expect(result.stderr).toBe("");
  expect(result.status).toBe(0);
});

test.each([
  ["upward", "admin upward import in entities/item/index.ts: entities may not import features"],
  [
    "app-import",
    "admin upward import in pages/home/HomePage/HomePage.tsx: pages may not import app",
  ],
  ["cross-slice", "admin cross-slice import in pages/home/HomePage/HomePage.tsx"],
  ["slice-deep-import", "bypasses widgets/panel/index.ts"],
  ["component-deep-import", "bypasses pages/home/HomePage/index.ts"],
  ["incomplete-component", "admin component folder shared/ui/Button is missing Button.test.tsx"],
  ["misplaced-component", "pages/home/HomePage/Helper.tsx"],
  ["missing-slice-index", "admin slice has no public index: widgets/orphan/index.ts is missing"],
  ["outside-layer", "admin source outside the layers: components/cn.ts"],
])("rejects the %s admin structure violation", (name, message) => {
  const result = checkAdminFixture(name);
  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain(message);
});
