import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterAll, beforeAll, expect, test } from "vitest";
import {
  guideFiles,
  developmentGuide,
  developmentSetupCommands,
  reviewEnvironment,
  setupDrift,
  updateEnvironment,
} from "../scripts/consumer-guides.mjs";

const exec = promisify(execFile);
const workspace = fileURLToPath(new URL("..", import.meta.url));
let root;
let project;

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "lace-consumer-guides-"));
  project = join(root, "acceptance-site");
  await exec(process.execPath, [
    join(workspace, "packages/create-lace/dist/bin.js"),
    "create",
    project,
    "--starter",
  ]);
});
afterAll(() => rm(root, { recursive: true, force: true }));

test("the generated development guide documents the Node setup sequence acceptance executes", async () => {
  expect(developmentSetupCommands(await readFile(join(project, developmentGuide), "utf8"))).toEqual(
    [
      "pnpm install",
      "pnpm env:prepare",
      "pnpm exec lace doctor --target node --mode compose --stage setup",
      "pnpm db:migrate",
      "pnpm content:sync",
      "pnpm auth:bootstrap",
      "pnpm dev:api",
    ],
  );
  expect(() => developmentSetupCommands("# Site\n")).toThrow("Install and prepare the environment");
});

test("development guide drift names the guide and the differing step", async () => {
  const guide = await readFile(join(project, developmentGuide), "utf8");
  const { scripts } = JSON.parse(await readFile(join(project, "package.json"), "utf8"));
  const expected = developmentSetupCommands(guide);
  expect(setupDrift(expected, expected, scripts)).toBeNull();
  const dropped = developmentSetupCommands(guide.replace("pnpm content:sync\n", ""));
  expect(setupDrift(dropped, expected, scripts)).toBe(
    'docs/lace-compose-dev.md step 5 documents "pnpm auth:bootstrap", acceptance runs "pnpm content:sync"',
  );
  const renamed = expected.map((line) => line.replace("pnpm db:migrate", "pnpm db:setup"));
  expect(setupDrift(renamed, renamed, scripts)).toBe(
    'docs/lace-compose-dev.md "pnpm db:setup" names no package script',
  );
});

test("the generated connection guide yields the existing-site fixture's own files", async () => {
  const files = guideFiles(await readFile(join(project, "docs/lace-astro-site.md"), "utf8"));
  expect([...files.keys()]).toEqual([
    "src/lib/lace.ts",
    "src/env.d.ts",
    "src/pages/index.astro",
    "src/pages/articles/[slug].astro",
  ]);
  for (const [path, content] of files)
    expect(content, path).toBe(
      await readFile(join(workspace, "tests/fixtures/existing-astro-site", path), "utf8"),
    );
  expect(() => guideFiles("`a.ts`:\n\ntext\n")).toThrow("not followed by a code block");
  expect(() => guideFiles("`a.ts`:\n\n```ts\nx\n")).toThrow("not closed");
});

test("environment review edits only the documented settings in place", () => {
  const text = '# comment\nLACE_API_PORT=3000\nLACE_AUTH_SECRET=abc\nLABEL="Main site"\n';
  expect(reviewEnvironment(text, { LACE_API_PORT: "4100" })).toBe(
    '# comment\nLACE_API_PORT=4100\nLACE_AUTH_SECRET=abc\nLABEL="Main site"\n',
  );
  expect(() => reviewEnvironment(text, { LACE_AUTH_SECRET: "x" })).toThrow("not a review setting");
  expect(() => updateEnvironment(text, { MISSING: "x" })).toThrow("found 0");
  expect(() => updateEnvironment("A=1\nA=2\n", { A: "3" })).toThrow("found 2");
  expect(() => updateEnvironment(text, { LACE_API_PORT: "1\n2" })).toThrow("spans lines");
  expect(updateEnvironment("A=1\n", { A: "$&x" })).toBe("A=$&x\n");
});
