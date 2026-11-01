// The documented import sample must stay valid for the starter configuration
// and identical to the JSON the public guide shows.
import { execFile } from "node:child_process";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterAll, beforeAll, expect, test } from "vitest";

const exec = promisify(execFile);
const workspace = fileURLToPath(new URL("..", import.meta.url));
const sampleDirectory = join(workspace, "apps/docs/public/examples/content-import");
const guide = join(workspace, "apps/docs/src/content/docs/en/latest/editing-content/import.md");
const bin = join(workspace, "packages/cli/dist/bin.js");
let project;

beforeAll(async () => {
  // Inside the workspace so the starter configuration resolves @lacecms packages.
  project = await mkdtemp(join(workspace, "tests/.import-sample-"));
  await cp(
    join(workspace, "packages/create-lace/templates/lace.config.ts"),
    join(project, "lace.config.ts"),
  );
});
afterAll(async () => rm(project, { recursive: true, force: true }));

async function validate(directory) {
  try {
    const { stdout } = await exec(
      process.execPath,
      [bin, "import", directory, "--validate-only", "--publish", "--json"],
      { cwd: project, env: { PATH: process.env.PATH } },
    );
    return { exitCode: 0, result: JSON.parse(stdout) };
  } catch (error) {
    if (typeof error.code !== "number") throw error;
    return { exitCode: error.code, result: JSON.parse(error.stdout) };
  }
}

test("the published sample package validates against the starter configuration", async () => {
  const { exitCode, result } = await validate(sampleDirectory);
  expect(result, "apps/docs/public/examples/content-import").toMatchObject({ ok: true });
  expect(exitCode).toBe(0);
});

test("a broken copy of the sample fails validation", async () => {
  const copy = await mkdtemp(join(project, "broken-"));
  await cp(sampleDirectory, copy, { recursive: true });
  const sample = JSON.parse(await readFile(join(copy, "lace-import.json"), "utf8"));
  sample.entries.find((entry) => entry.key === "settings").fields.siteName = "";
  sample.entries.find((entry) => entry.key === "hello-lace").model = "journal";
  await writeFile(join(copy, "lace-import.json"), JSON.stringify(sample));
  const { exitCode, result } = await validate(copy);
  expect(exitCode).toBe(4);
  expect(result).toMatchObject({ ok: false, code: "IMPORT_INVALID" });
});

test("the import guide shows the published sample JSON", async () => {
  const markdown = await readFile(guide, "utf8");
  const block = /```json title="lace-import\.json"\n([\s\S]*?)\n```/u.exec(markdown);
  expect(block, "guide has a lace-import.json code block").not.toBeNull();
  const published = await readFile(join(sampleDirectory, "lace-import.json"), "utf8");
  expect(JSON.parse(block[1])).toEqual(JSON.parse(published));
});
