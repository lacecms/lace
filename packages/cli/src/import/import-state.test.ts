import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { ImportState } from "./import-state.js";

const directories: string[] = [];
async function directory() {
  const path = await mkdtemp(join(tmpdir(), "lace-import-state-"));
  directories.push(path);
  return path;
}
afterEach(async () => {
  for (const path of directories.splice(0)) await rm(path, { recursive: true, force: true });
});

describe("import state file", () => {
  test("a missing file is empty; saved records are kept per origin", async () => {
    const path = join(await directory(), "lace-import.state.json");
    const state = await ImportState.open(path, "https://a.example");
    expect(state.entry("about")).toBeUndefined();
    state.setMedia("hero", { id: "m1", sha256: "a".repeat(64) });
    state.setEntry("about", { id: "e1", model: "about", revision: 3 });
    await state.save();
    const other = await ImportState.open(path, "https://b.example");
    expect(other.entry("about")).toBeUndefined();
    other.setEntry("about", { id: "e9", model: "about", revision: 1 });
    await other.save();
    const reread = await ImportState.open(path, "https://a.example");
    expect(reread.media("hero")).toEqual({ id: "m1", sha256: "a".repeat(64) });
    expect(reread.entry("about")).toEqual({ id: "e1", model: "about", revision: 3 });
    const saved = JSON.parse(await readFile(path, "utf8"));
    expect(Object.keys(saved.targets)).toEqual(["https://a.example", "https://b.example"]);
    expect(reread.entry("__proto__")).toBeUndefined();
  });

  test("a malformed file fails instead of being replaced", async () => {
    const path = join(await directory(), "state.json");
    for (const text of ["{", JSON.stringify({ formatVersion: 2, targets: {} })]) {
      await writeFile(path, text);
      await expect(ImportState.open(path, "https://a.example")).rejects.toMatchObject({
        code: "IMPORT_SETTINGS",
      });
    }
  });
});
