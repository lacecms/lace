import { spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, afterEach, beforeAll, describe, expect, test } from "vitest";
import { parseImportArguments, runImportCommand } from "../dist/import-command.js";
import { configSource, removePackages, samplePackage, writePackage } from "./import-fixtures.mjs";

const packageRoot = fileURLToPath(new URL("..", import.meta.url));
let project;
beforeAll(async () => {
  project = await mkdtemp(join(packageRoot, ".import-command-"));
  await writeFile(join(project, "lace.config.ts"), configSource);
});
afterAll(async () => rm(project, { recursive: true, force: true }));
afterEach(removePackages);

const noNetwork = async () => {
  throw new Error("network used");
};

describe("lace import arguments", () => {
  test("parses options and refuses repeats, unknown flags and invalid combinations", () => {
    expect(
      parseImportArguments(["out", "--publish", "--dry-run", "--url", "https://x.test", "--json"]),
    ).toEqual({
      directory: "out",
      url: "https://x.test",
      publish: true,
      dryRun: true,
      validateOnly: false,
      overwrite: false,
      json: true,
    });
    for (const argv of [
      [],
      ["a", "b"],
      ["out", "--publish", "--publish"],
      ["out", "--force"],
      ["out", "--url"],
      ["out", "--validate-only", "--dry-run"],
      ["out", "--validate-only", "--url", "https://x.test"],
      ["out", "--validate-only", "--overwrite"],
      ["out", "--validate-only", "--state", "s.json"],
    ])
      expect(() => parseImportArguments(argv)).toThrow(
        expect.objectContaining({ code: "IMPORT_USAGE" }),
      );
  });

  test("usage errors exit 3 with the usage text", async () => {
    const result = await runImportCommand(["out", "--validate-only", "--dry-run"], {
      cwd: project,
      env: {},
    });
    expect(result).toMatchObject({ ok: false, code: "IMPORT_USAGE", exitCode: 3 });
    expect(result.message).toContain("Usage: lace import");
  });
});

describe("lace import --validate-only", () => {
  test("validates offline without a token", async () => {
    const directory = await writePackage();
    const result = await runImportCommand([directory, "--validate-only", "--publish"], {
      cwd: project,
      env: {},
      fetch: noNetwork,
    });
    expect(result).toMatchObject({ ok: true, code: "IMPORT_VALID", exitCode: 0 });
    expect(result.data).toEqual({ media: 2, entries: 4 });
  });

  test("invalid packages exit 4 with every pointer in JSON data and no values", async () => {
    const pkg = samplePackage();
    pkg.entries[2].fields.summary = { secret: "sentinel-value" };
    pkg.formatVersion = 1;
    pkg.media[0].file = "../escape.png";
    const directory = await writePackage(pkg);
    const result = await runImportCommand([directory, "--validate-only", "--json"], {
      cwd: project,
      env: {},
      fetch: noNetwork,
    });
    expect(result).toMatchObject({ ok: false, code: "IMPORT_INVALID", exitCode: 4, json: true });
    expect(result.data.issues.map((issue) => issue.pointer)).toEqual([
      "/media/0/file",
      "/entries/2/fields/summary",
    ]);
    expect(JSON.stringify(result)).not.toContain("sentinel-value");
  });

  test("a missing lace.config.ts is a settings error", async () => {
    const directory = await writePackage();
    const result = await runImportCommand([directory, "--validate-only"], {
      cwd: join(project, "missing"),
      env: {},
    });
    expect(result).toMatchObject({ code: "IMPORT_SETTINGS", exitCode: 4 });
  });
});

describe("lace import settings", () => {
  test("token and URL are required; plain HTTP to a remote host fails before any request", async () => {
    const directory = await writePackage();
    const missing = await runImportCommand([directory], {
      cwd: project,
      env: {},
      fetch: noNetwork,
    });
    expect(missing).toMatchObject({ code: "IMPORT_SETTINGS", exitCode: 4 });
    expect(missing.message).toContain("LACE_IMPORT_TOKEN");
    const insecure = await runImportCommand([directory, "--url", "http://cms.example.com"], {
      cwd: project,
      env: { LACE_IMPORT_TOKEN: "sentinel-token" },
      fetch: noNetwork,
    });
    expect(insecure).toMatchObject({ code: "IMPORT_USAGE", exitCode: 3 });
    expect(insecure.message).not.toContain("sentinel-token");
  });
});

describe("lace binary", () => {
  test("dispatches import help and JSON failures with diagnostics", () => {
    const bin = join(packageRoot, "dist/bin.js");
    const help = spawnSync(process.execPath, [bin, "import", "--help"], { encoding: "utf8" });
    expect(help.status).toBe(0);
    expect(help.stdout).toContain("lace import <dir>");
    const failed = spawnSync(process.execPath, [bin, "import", "out", "--json"], {
      cwd: project,
      encoding: "utf8",
      env: { PATH: process.env.PATH },
    });
    expect(failed.status).toBe(4);
    const output = JSON.parse(failed.stdout);
    expect(output).toMatchObject({ ok: false, code: "IMPORT_SETTINGS", operation: "import" });
    expect(output.nextAction).toContain("LACE_IMPORT_TOKEN");
    expect(failed.stderr).toBe("");
    const human = spawnSync(
      process.execPath,
      [bin, "import", "out", "--url", "http://cms.example.com"],
      {
        cwd: project,
        encoding: "utf8",
        env: { PATH: process.env.PATH, LACE_IMPORT_TOKEN: "sentinel-token" },
      },
    );
    expect(human.status).toBe(3);
    expect(human.stdout).toBe("");
    expect(human.stderr).toContain("Operation: import");
    expect(human.stderr).toContain("Recovery:");
    expect(`${human.stdout}${human.stderr}`).not.toContain("sentinel-token");
  });
});
