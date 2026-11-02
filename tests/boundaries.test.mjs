import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
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

test.each([
  ["astro-content", "forbidden dependency: @lacecms/astro -> @lacecms/content"],
  ["astro-reexport", "framework adapter @lacecms/astro may not re-export a Lace package"],
  ["astro-node", "framework adapter @lacecms/astro may not import fs/promises"],
])("rejects the %s adapter boundary violation", (name, message) => {
  const result = spawnSync(process.execPath, [checker, join(fixtureDirectory, "adapter", name)], {
    encoding: "utf8",
  });
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

test.each(["docs-runtime", "runtime-docs"])("rejects %s coupling", (fixture) => {
  const result = spawnSync(process.execPath, [checker, join(fixtureDirectory, fixture)], {
    encoding: "utf8",
  });
  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain(
    fixture === "docs-runtime" ? "forbidden dependency" : "may not import @lacecms/app-docs",
  );
});

test.each([
  ["mcp", "@lacecms/db"],
  ["mcp", "@lacecms/platform-node"],
  ["mcp", "@lacecms/platform-cloudflare"],
  ["mcp", "@lacecms/server"],
  ["mcp", "@lacecms/auth"],
  ["mcp", "node:fs"],
  ["application", "@lacecms/contracts"],
  ["application", "@modelcontextprotocol/server"],
])("portable %s rejects %s", (name, dependency) => {
  const root = mkdtempSync(join(tmpdir(), "lace-mcp-boundary-"));
  try {
    const directory = join(root, "packages", name);
    mkdirSync(join(directory, "src"), { recursive: true });
    writeFileSync(join(directory, "package.json"), JSON.stringify({ name: `@lacecms/${name}` }));
    writeFileSync(join(directory, "src/index.ts"), `import "${dependency}";\n`);
    const result = spawnSync(process.execPath, [checker, root], { encoding: "utf8" });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(`may not import ${dependency}`);
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});

test.each(["test-imports", "test-source-path"])(
  "excludes %s test imports from boundaries",
  (name) => {
    const result = spawnSync(process.execPath, [checker, join(fixtureDirectory, name)], {
      encoding: "utf8",
    });
    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
  },
);

test.each([
  ["render", 'import "node:path";', "may not import node:path"],
  ["astro", 'import "@lacecms/content";', "forbidden dependency"],
  ["astro", 'import "../test-fixtures/Blocks.astro";', "cross-package source-path import"],
  ["astro", 'export { field } from "@lacecms/content";', "forbidden dependency"],
])("still checks production %s imports: %s", (name, source, message) => {
  const root = mkdtempSync(join(tmpdir(), "lace-production-boundary-"));
  try {
    for (const member of [name, "content"]) {
      const directory = join(root, "packages", member);
      mkdirSync(join(directory, "src"), { recursive: true });
      writeFileSync(
        join(directory, "package.json"),
        JSON.stringify({ name: `@lacecms/${member}` }),
      );
      writeFileSync(join(directory, "src/index.ts"), member === name ? source : "export {};\n");
    }
    const result = spawnSync(process.execPath, [checker, root], { encoding: "utf8" });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(message);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("still rejects cycles in production imports", () => {
  const root = mkdtempSync(join(tmpdir(), "lace-cycle-boundary-"));
  try {
    // The permitted graph is acyclic; a production cycle necessarily has a forbidden edge.
    for (const member of ["platform-node", "platform-cloudflare"]) {
      const directory = join(root, "packages", member);
      mkdirSync(join(directory, "src"), { recursive: true });
      writeFileSync(
        join(directory, "package.json"),
        JSON.stringify({ name: `@lacecms/${member}` }),
      );
      writeFileSync(
        join(directory, "src/index.ts"),
        `import "@lacecms/${member === "platform-node" ? "platform-cloudflare" : "platform-node"}";`,
      );
    }
    const result = spawnSync(process.execPath, [checker, root], { encoding: "utf8" });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("forbidden dependency");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
