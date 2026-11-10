import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { execFileSync, spawnSync } from "node:child_process";
import { basename, dirname, join } from "node:path";
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

function checkLeafFixture(files) {
  const root = mkdtempSync(join(tmpdir(), "lace-admin-leaf-"));
  try {
    const base = join(root, "apps/admin");
    mkdirSync(base, { recursive: true });
    writeFileSync(join(base, "package.json"), '{"name":"@lacecms/app-admin"}');
    for (const [path, content] of Object.entries(files)) {
      const file = join(base, "src", path);
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, content);
    }
    return spawnSync(process.execPath, [checker, root], { encoding: "utf8" });
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
}

const privateLeaf = {
  "widgets/example/index.ts": 'export { Example } from "./Example/index.js";',
  "widgets/example/Example/index.ts": 'export { Example } from "./Example.js";',
  "widgets/example/Example/Example.tsx":
    'import { Leaf } from "./Leaf.js"; export const Example = () => <Leaf />;',
  "widgets/example/Example/Example.test.tsx": "",
  "widgets/example/Example/Leaf.tsx": "export const Leaf = () => null;",
  "widgets/example/Example/Leaf.test.tsx": "",
};

test("allows a private tested sibling component", () => {
  const result = checkLeafFixture(privateLeaf);
  expect(result.stderr).toBe("");
  expect(result.status).toBe(0);
});

test("ignores export-like comments and string contents", () => {
  const result = checkLeafFixture({
    ...privateLeaf,
    "widgets/example/index.ts": `// export { Leaf } from "./Example/Leaf.js";
const message = 'export { Leaf } from "./Example/Leaf.js";';
const template = \`export { Leaf } from "./Example/Leaf.js";\`;
export { Example } from "./Example/index.js";`,
  });
  expect(result.status).toBe(0);
  expect(result.stderr).toBe("");
});

test.each([
  ["missing test", { "widgets/example/Example/Leaf.test.tsx": null }, "Leaf.test.tsx"],
  [
    "direct export",
    { "widgets/example/index.ts": 'export { Leaf } from "./Example/Leaf.js";' },
    "Leaf.tsx",
  ],
  [
    "transitive export",
    {
      "widgets/example/index.ts": 'export { Leaf } from "./bridge.js";',
      "widgets/example/bridge.ts": 'export { Leaf } from "./Example/Leaf.js";',
    },
    "Leaf.tsx",
  ],
  [
    "imported local export",
    {
      "widgets/example/index.ts":
        'import { Leaf as Alias } from "./Example/Leaf.js"; export { Alias };',
    },
    "Leaf.tsx",
  ],
  [
    "namespace local export",
    {
      "widgets/example/index.ts": 'import * as Alias from "./Example/Leaf.js"; export { Alias };',
    },
    "Leaf.tsx",
  ],
  [
    "default local export",
    {
      "widgets/example/index.ts": 'import Alias from "./Example/Leaf.js"; export { Alias };',
    },
    "Leaf.tsx",
  ],
  [
    "default export expression",
    {
      "widgets/example/index.ts": 'import Alias from "./Example/Leaf.js"; export default Alias;',
    },
    "Leaf.tsx",
  ],
  [
    "combined import",
    {
      "widgets/example/index.ts":
        'import Other, { Leaf as Alias } from "./Example/Leaf.js"; export { Alias };',
    },
    "Leaf.tsx",
  ],
  [
    "exported const alias",
    {
      "widgets/example/index.ts":
        'import { Leaf } from "./Example/Leaf.js"; export const Public = Leaf;',
    },
    "Leaf.tsx",
  ],
  [
    "outside import",
    {
      "pages/home/index.ts": 'import { Leaf } from "../../widgets/example/Example/Leaf.js";',
    },
    "Leaf",
  ],
  [
    "malformed name",
    {
      "widgets/example/Example/notPascal.tsx": "export const leaf = () => null;",
    },
    "notPascal.tsx",
  ],
])("rejects %s for a sibling component", (_name, changes, message) => {
  const files = { ...privateLeaf, ...changes };
  for (const [path, content] of Object.entries(files)) if (content === null) delete files[path];
  const result = checkLeafFixture(files);
  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain(message);
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

function checkSourceSize({ file = "index.ts", lines = 1_001, baseline, missing = false }) {
  const root = mkdtempSync(join(tmpdir(), "lace-source-size-"));
  try {
    const directory = join(root, "packages/content");
    mkdirSync(join(directory, "src", dirname(file)), { recursive: true });
    writeFileSync(join(directory, "package.json"), JSON.stringify({ name: "@lacecms/content" }));
    if (!missing) writeFileSync(join(directory, "src", file), "// source line\n".repeat(lines));
    if (baseline !== undefined) {
      mkdirSync(join(root, "scripts"), { recursive: true });
      writeFileSync(
        join(root, "scripts/oversized-source-baseline.json"),
        JSON.stringify({ [`packages/content/src/${file}`]: baseline }),
      );
    }
    return spawnSync(process.execPath, [checker, root], { encoding: "utf8" });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test("rejects a new 1001-line production file without a baseline", () => {
  const result = checkSourceSize({});
  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain("packages/content/src/index.ts has 1001 lines; limit is 1000");
});

test("allows a production file at the 1000-line limit without a baseline", () => {
  const result = checkSourceSize({ lines: 1_000 });
  expect(result.status).toBe(0);
  expect(result.stderr).toBe("");
});

test("rejects a baselined production file that grows past its recorded size", () => {
  const result = checkSourceSize({ lines: 1_003, baseline: 1_002 });
  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain("packages/content/src/index.ts has 1003 lines; recorded 1002");
});

test.each([1_001, 1_002])(
  "allows a baselined production file of %i lines at or below its baseline",
  (lines) => {
    const result = checkSourceSize({ lines, baseline: 1_002 });
    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
  },
);

test.each([
  { lines: 1_000, missing: false, message: "has 1000 lines (limit 1000)" },
  { lines: 999, missing: false, message: "has 999 lines (limit 1000)" },
  { lines: 1_001, missing: true, message: "is missing from production source" },
])("rejects a stale source size baseline: $message", ({ lines, missing, message }) => {
  const result = checkSourceSize({ lines, missing, baseline: 1_002 });
  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain(
    "stale source size baseline entry: packages/content/src/index.ts",
  );
  expect(result.stderr).toContain(message);
});

test.each(["large.test.ts", "test-support/large.ts"])(
  "excludes oversized %s from source size checks",
  (file) => {
    const result = checkSourceSize({ file });
    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
  },
);

test("scans a regex containing a hash before a forbidden import without hanging", () => {
  const root = mkdtempSync(join(tmpdir(), "lace-regex-boundary-"));
  try {
    const directory = join(root, "packages/content");
    mkdirSync(join(directory, "src"), { recursive: true });
    writeFileSync(join(directory, "package.json"), JSON.stringify({ name: "@lacecms/content" }));
    writeFileSync(
      join(directory, "src/index.ts"),
      'const pattern = /[.%#[\\]]/u;\nimport "node:fs";\n',
    );
    const result = spawnSync(process.execPath, [checker, root], {
      encoding: "utf8",
      timeout: 5_000,
    });
    expect(result.error).toBeUndefined();
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      "Node builtin import in portable package @lacecms/content: node:fs",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

function checkScratch(files, baselines = {}) {
  const root = mkdtempSync(join(tmpdir(), "lace-source-guards-"));
  try {
    const members = new Set(
      Object.keys(files).map((file) => file.split("/").slice(0, 2).join("/")),
    );
    for (const member of members) {
      mkdirSync(join(root, member, "src"), { recursive: true });
      if (!Object.hasOwn(files, `${member}/package.json`))
        writeFileSync(
          join(root, member, "package.json"),
          JSON.stringify({ name: `@lacecms/${basename(member)}` }),
        );
    }
    for (const [file, text] of Object.entries(files)) {
      mkdirSync(join(root, dirname(file)), { recursive: true });
      writeFileSync(join(root, file), text);
    }
    mkdirSync(join(root, "scripts"), { recursive: true });
    for (const [name, value] of Object.entries(baselines))
      writeFileSync(join(root, "scripts", name), JSON.stringify(value));
    return spawnSync(process.execPath, [checker, root], { encoding: "utf8" });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

const nocheck = "// @ts-nocheck\n// TODO(rf2): Legacy fixture.\nexport {};\n";

test.each([
  {
    name: "an unlisted test",
    file: "packages/content/src/a.test.ts",
    listed: [],
    message:
      "typecheck exception not in baseline: packages/content/src/a.test.ts disables type checking",
  },
  {
    name: "a listed test-support module",
    file: "packages/content/src/test-support/helpers.ts",
    listed: ["packages/content/src/test-support/helpers.ts"],
    message:
      "typecheck exception forbidden: packages/content/src/test-support/helpers.ts is not a test file",
  },
  {
    name: "an unlisted test-support module",
    file: "packages/content/src/test-support/helpers.ts",
    listed: [],
    message:
      "typecheck exception forbidden: packages/content/src/test-support/helpers.ts is not a test file",
  },
  {
    name: "a production module",
    file: "packages/content/src/model.ts",
    listed: [],
    message: "typecheck exception forbidden: packages/content/src/model.ts is not a test file",
  },
])("rejects a typecheck exception in $name", ({ file, listed, message }) => {
  const result = checkScratch(
    { [file]: nocheck, "packages/content/src/index.ts": "export {};\n" },
    { "test-typecheck-baseline.json": listed },
  );
  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain(message);
});

test.each([
  {
    name: "typed",
    files: { "packages/content/src/a.test.ts": "export {};\n" },
    reason: "no longer disables type checking",
  },
  { name: "deleted", files: {}, reason: "is missing" },
])("rejects a stale typecheck baseline entry for a $name test", ({ files, reason }) => {
  const result = checkScratch(
    { ...files, "packages/content/src/index.ts": "export {};\n" },
    { "test-typecheck-baseline.json": ["packages/content/src/a.test.ts"] },
  );
  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain(
    `stale typecheck baseline entry: packages/content/src/a.test.ts ${reason}`,
  );
});

test("allows a listed legacy test that disables type checking", () => {
  const result = checkScratch(
    { "packages/content/src/a.test.ts": nocheck, "packages/content/src/index.ts": "export {};\n" },
    { "test-typecheck-baseline.json": ["packages/content/src/a.test.ts"] },
  );
  expect(result.stderr).toBe("");
  expect(result.status).toBe(0);
});

test.each([
  ["import type", 'import type { B } from "./b.js";\nexport type A = B;\n'],
  ["export type from", 'export type { B } from "./b.js";\n'],
])("rejects a module cycle closed by %s", (_form, closing) => {
  const result = checkScratch({
    "packages/content/src/index.ts": 'export * from "./a.js";\n',
    "packages/content/src/a.ts": closing,
    "packages/content/src/b.ts": 'import { a } from "./a.js";\nexport type B = typeof a;\n',
  });
  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain(
    "module cycle: packages/content/src/a.ts, packages/content/src/b.ts",
  );
});

const legacyCycle = {
  "packages/domain/src/index.ts": 'export * from "./seo.js";\n',
  "packages/domain/src/seo.ts": 'import "./index.js";\nexport const seo = 1;\n',
};

test("allows a module cycle inside a baselined component", () => {
  const result = checkScratch(legacyCycle, {
    "source-cycle-baseline.json": [["packages/domain/src/index.ts", "packages/domain/src/seo.ts"]],
  });
  expect(result.stderr).toBe("");
  expect(result.status).toBe(0);
});

test("rejects a baselined module cycle that grows", () => {
  const result = checkScratch(
    {
      ...legacyCycle,
      "packages/domain/src/seo.ts": 'import "./index.js";\nimport "./routes.js";\n',
      "packages/domain/src/routes.ts": 'import "./seo.js";\n',
    },
    {
      "source-cycle-baseline.json": [
        ["packages/domain/src/index.ts", "packages/domain/src/seo.ts"],
      ],
    },
  );
  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain(
    "module cycle: packages/domain/src/index.ts, packages/domain/src/routes.ts, packages/domain/src/seo.ts",
  );
});

test("rejects a stale module cycle baseline entry", () => {
  const result = checkScratch(
    { ...legacyCycle, "packages/domain/src/seo.ts": "export const seo = 1;\n" },
    {
      "source-cycle-baseline.json": [
        ["packages/domain/src/index.ts", "packages/domain/src/seo.ts"],
      ],
    },
  );
  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain(
    "stale source cycle baseline entry: packages/domain/src/index.ts, packages/domain/src/seo.ts",
  );
});

test("keeps test files and test-support modules out of module cycles", () => {
  const result = checkScratch({
    "packages/content/src/index.ts": "export const value = 1;\n",
    "packages/content/src/test-support/a.ts": 'import "./b.js";\n',
    "packages/content/src/test-support/b.ts": 'import "./a.js";\n',
    "packages/content/src/index.test.ts": 'import "./index.type-test.js";\n',
    "packages/content/src/index.type-test.ts": 'import "./index.test.js";\n',
  });
  expect(result.stderr).toBe("");
  expect(result.status).toBe(0);
});

const declaredLayout = {
  "packages/content": { shared: [], fields: ["shared"] },
};
const declaredSources = {
  "packages/content/package.json": JSON.stringify({
    name: "@lacecms/content",
    exports: {
      ".": {
        "@lacecms/source": "./src/index.ts",
        types: "./dist/index.d.ts",
        import: "./dist/index.js",
      },
    },
  }),
  "packages/content/src/index.ts":
    '// Directory dependencies: shared ← fields.\nexport * from "./fields/field.js";\n',
  "packages/content/src/shared/json.ts": "export const json = 1;\n",
  "packages/content/src/fields/field.ts":
    'import { json } from "../shared/json.js";\nexport const field = json;\n',
};

test("allows a package that follows its declared layout", () => {
  const result = checkScratch(declaredSources, { "source-layout.json": declaredLayout });
  expect(result.stderr).toBe("");
  expect(result.status).toBe(0);
});

test.each([
  {
    name: "an import against the declared direction",
    files: {
      "packages/content/src/shared/text.ts":
        'import "../fields/field.js";\nexport const text = 1;\n',
    },
    message:
      "source layout: packages/content/src/shared/text.ts imports packages/content/src/fields/field.ts; shared -> fields is not declared for packages/content",
  },
  {
    name: "an import of the package entry",
    files: {
      "packages/content/src/shared/text.ts": 'import "../index.js";\nexport const text = 1;\n',
    },
    message: "shared -> <entry> is not declared for packages/content",
  },
  {
    name: "a subdirectory barrel",
    files: { "packages/content/src/fields/index.ts": 'export * from "./field.js";\n' },
    message: "source layout: subdirectory barrel packages/content/src/fields/index.ts",
  },
  {
    name: "an extra root module",
    files: { "packages/content/src/helpers.ts": "export const helper = 1;\n" },
    message:
      "source layout: packages/content/src/helpers.ts is a root module but not a package entry",
  },
  {
    name: "an undeclared directory",
    files: { "packages/content/src/blocks/block.ts": "export const block = 1;\n" },
    message:
      "source layout: packages/content directories [blocks, fields, shared] differ from scripts/source-layout.json [fields, shared]",
  },
  {
    name: "an entry header naming an extra directory",
    files: {
      "packages/content/src/index.ts":
        '// Directory dependencies: shared ← fields ← blocks.\nexport * from "./fields/field.js";\n',
    },
    message: "source layout: packages/content entry header names [blocks, fields, shared]",
  },
  {
    name: "an entry header missing a directory",
    files: {
      "packages/content/src/index.ts":
        '// Directory dependencies: fields.\nexport * from "./fields/field.js";\n',
    },
    message: "source layout: packages/content entry header names [fields]",
  },
])("rejects $name in a declared package", ({ files, message }) => {
  const result = checkScratch(
    { ...declaredSources, ...files },
    { "source-layout.json": declaredLayout },
  );
  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain(message);
});

const rootEntrySources = {
  ...declaredSources,
  "packages/content/src/main.ts":
    'import { field } from "./fields/field.js";\nconsole.info(field);\n',
};

test("allows a listed process entry at a declared package root", () => {
  const result = checkScratch(rootEntrySources, {
    "source-layout.json": declaredLayout,
    "source-root-entries.json": { "packages/content/src/main.ts": "Started by node." },
  });
  expect(result.stderr).toBe("");
  expect(result.status).toBe(0);
});

test.each([
  {
    name: "a missing module",
    entries: { "packages/content/src/gone.ts": "Removed." },
    message: "stale source root entry: packages/content/src/gone.ts is missing",
  },
  {
    name: "a nested module",
    entries: { "packages/content/src/fields/field.ts": "Nested." },
    message:
      "stale source root entry: packages/content/src/fields/field.ts is not a src/ root module",
  },
  {
    name: "an undeclared package",
    entries: { "packages/render/src/index.ts": "Undeclared." },
    message:
      "stale source root entry: packages/render/src/index.ts is not in a package declared in scripts/source-layout.json",
  },
])("rejects a root entry naming $name", ({ entries, message }) => {
  const result = checkScratch(rootEntrySources, {
    "source-layout.json": declaredLayout,
    "source-root-entries.json": { "packages/content/src/main.ts": "Started by node.", ...entries },
  });
  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain(message);
});

const flatSources = {
  ...declaredSources,
  "packages/render/src/index.ts": 'export * from "./blocks.js";\n',
  "packages/render/src/blocks.ts": "export const block = 1;\n",
  "packages/render/src/test-support/fixture.ts": "export const fixture = 1;\n",
};

test("allows an exempt single-concern package to stay flat", () => {
  const result = checkScratch(flatSources, {
    "source-layout.json": declaredLayout,
    "source-layout-exemptions.json": { "packages/render": "Single render core." },
  });
  expect(result.stderr).toBe("");
  expect(result.status).toBe(0);
});

test.each([
  {
    name: "a package that gains a directory",
    files: { "packages/render/src/blocks/block.ts": "export const block = 1;\n" },
    exemptions: { "packages/render": "Single render core." },
    message:
      "source layout exemption: packages/render has directory src/blocks; declare the package in scripts/source-layout.json instead",
  },
  {
    name: "a declared package",
    files: {},
    exemptions: { "packages/content": "Also declared." },
    message:
      "source layout exemption: packages/content is also declared in scripts/source-layout.json",
  },
  {
    name: "an unknown member",
    files: {},
    exemptions: { "packages/gone": "Removed." },
    message: "source layout exemption names unknown member: packages/gone",
  },
])("rejects an exemption for $name", ({ files, exemptions, message }) => {
  const result = checkScratch(
    { ...flatSources, ...files },
    { "source-layout.json": declaredLayout, "source-layout-exemptions.json": exemptions },
  );
  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain(message);
});

function checkSourceConditionFixture(exports, sources = ["index.ts"]) {
  const root = mkdtempSync(join(tmpdir(), "lace-source-condition-"));
  try {
    const directory = join(root, "packages", "content");
    mkdirSync(join(directory, "src"), { recursive: true });
    writeFileSync(
      join(directory, "package.json"),
      JSON.stringify({ name: "@lacecms/content", exports }),
    );
    for (const source of sources) {
      mkdirSync(dirname(join(directory, "src", source)), { recursive: true });
      writeFileSync(join(directory, "src", source), "export {};\n");
    }
    return spawnSync(process.execPath, [checker, root], { encoding: "utf8" });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test("allows compiled exports that list their source condition first", () => {
  const result = checkSourceConditionFixture(
    {
      ".": {
        "@lacecms/source": "./src/index.ts",
        types: "./dist/index.d.ts",
        import: "./dist/index.js",
      },
      "./Box.astro": { "@lacecms/source": "./src/Box.astro", default: "./dist/Box.astro" },
      "./schema.json": "./schema/schema.json",
      "./test": { "@lacecms/source": "./src/test-support/harness.ts" },
    },
    ["index.ts", "Box.astro", "test-support/harness.ts"],
  );
  expect(result.stderr).toBe("");
  expect(result.status).toBe(0);
});

test.each([
  [
    "a missing condition",
    { ".": { types: "./dist/index.d.ts", import: "./dist/index.js" } },
    'source condition: @lacecms/content export "." has no @lacecms/source condition',
  ],
  [
    "a string compiled export",
    { "./Box.astro": "./dist/Box.astro" },
    'source condition: @lacecms/content export "./Box.astro" has no @lacecms/source condition',
  ],
  [
    "a condition that is not first",
    {
      ".": {
        types: "./dist/index.d.ts",
        "@lacecms/source": "./src/index.ts",
        import: "./dist/index.js",
      },
    },
    'source condition: @lacecms/content export "." must list @lacecms/source first',
  ],
  [
    "a missing source file",
    {
      "./test": {
        "@lacecms/source": "./src/test.ts",
        types: "./dist/test.d.ts",
        import: "./dist/test.js",
      },
    },
    'source condition: @lacecms/content export "./test" names missing source ./src/test.ts',
  ],
  [
    "a source file that does not match the target",
    {
      "./test": {
        "@lacecms/source": "./src/index.ts",
        types: "./dist/test.d.ts",
        import: "./dist/test.js",
      },
    },
    'source condition: @lacecms/content export "./test" names ./src/index.ts, but ./dist/test.d.ts is not built from it',
  ],
  [
    "a source-only export outside test-support",
    { "./helpers": { "@lacecms/source": "./src/index.ts" } },
    'source condition: @lacecms/content export "./helpers" is source-only, which only a src/test-support/ module may be',
  ],
])("rejects %s", (_name, exports, message) => {
  const result = checkSourceConditionFixture(exports);
  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain(message);
});

test("allows listed JavaScript sources and JavaScript tests", () => {
  const result = checkScratch(
    {
      "packages/content/src/index.ts": "export {};\n",
      "packages/content/src/init.mjs": "export {};\n",
      "packages/content/src/script.test.mjs": "export {};\n",
      "packages/content/src/entry.packaged.test.mjs": "export {};\n",
    },
    {
      "javascript-source-allowlist.json": {
        "packages/content/src/init.mjs": "Plain-Node init.",
        "packages/content/src/script.test.mjs": "Tests the listed init script.",
      },
    },
  );
  expect(result.stderr).toBe("");
  expect(result.status).toBe(0);
});

test("allows packaged-output JavaScript tests without listing them", () => {
  const result = checkScratch(
    {
      "packages/content/src/index.ts": "export {};\n",
      "packages/content/src/entry.packaged.test.mjs": "export {};\n",
    },
    { "javascript-source-allowlist.json": {} },
  );
  expect(result.stderr).toBe("");
  expect(result.status).toBe(0);
});

test.each([
  [
    "an unlisted JavaScript source",
    { "packages/content/src/helper.mjs": "export {};\n" },
    {},
    "untyped source module: packages/content/src/helper.mjs",
  ],
  [
    "a JavaScript test-support module",
    { "packages/content/src/test-support/harness.mjs": "export {};\n" },
    { "packages/content/src/test-support/harness.mjs": "listed anyway" },
    "untyped test-support module: packages/content/src/test-support/harness.mjs",
  ],
  [
    "an unlisted JavaScript source test",
    { "packages/content/src/script.test.mjs": "export {};\n" },
    {},
    "JavaScript source test: packages/content/src/script.test.mjs",
  ],
  [
    "a stale allowlist entry",
    {},
    { "packages/content/src/gone.mjs": "Removed script." },
    "stale JavaScript source allowlist entry: packages/content/src/gone.mjs is missing",
  ],
])("rejects %s", (_name, files, allowlist, message) => {
  const result = checkScratch(
    { "packages/content/src/index.ts": "export {};\n", ...files },
    { "javascript-source-allowlist.json": allowlist },
  );
  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain(message);
});
