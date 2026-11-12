// @ts-nocheck
// TODO(rf2): Type legacy command fixtures, filesystem helpers and recorded adapter calls.
import { mkdir, symlink, writeFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { describe, it, expect } from "vitest";
import { directory } from "../test-support/upgrade-fixtures.ts";
import {
  inspectDestination,
  inspectRoots,
  inspectInventory,
  atomicWrite,
  jsonBytes,
} from "./upgrade-files.js";
import { validateOperation, validatePointer } from "./upgrade-journal.js";
import { upgradeHash } from "./upgrade-input.js";

describe("safe upgrade paths and metadata", () => {
  it("refuses overlap, symlink ancestors, nonregular paths and case aliases", async () => {
    expect(() => inspectInventory(["DIR/a", "dir/b"])).toThrow("case-aliased");
    expect(() => inspectInventory(["file", "file/sub"])).toThrow("file/directory");
    const root = await directory();
    await expect(inspectRoots(root, root)).rejects.toThrow("non-overlapping");
    await expect(inspectRoots(root, join(root, "target"))).rejects.toThrow("non-overlapping");
    await mkdir(join(root, "folder"));
    await symlink(join(root, "folder"), join(root, "linked"));
    await expect(inspectDestination(root, "linked/file")).rejects.toThrow("symbolic");
    await expect(inspectDestination(root, "folder")).rejects.toThrow("regular");
    await writeFile(join(root, "File"), "x");
    await expect(inspectDestination(root, "file")).rejects.toThrow(/case aliases/u);
    await expect(inspectDestination(root, "File/sub")).rejects.toThrow();
  });
  it("uses a content guard before atomic publication", async () => {
    const root = await directory();
    await writeFile(join(root, "file"), "unexpected");
    await expect(
      atomicWrite(root, "file", Buffer.from("next"), 0o600, upgradeHash(Buffer.from("old"))),
    ).rejects.toThrow("Unexpected file state");
    expect(await readFile(join(root, "file"), "utf8")).toBe("unexpected");
  });
  it("rejects corrupt/newer metadata and unsafe or user-owned mutation records", () => {
    const pointer = { schemaVersion: 1, id: randomUUID(), phase: "applying" };
    const old = {
      schemaVersion: 1,
      templateVersion: "1",
      site: { mode: "starter", path: "site" },
      files: { file: { owner: "managed", sha256: upgradeHash(Buffer.from("old")) } },
    };
    const target = {
      ...old,
      templateVersion: "2",
      files: { file: { owner: "managed", sha256: upgradeHash(Buffer.from("new")) } },
    };
    const oldBytes = jsonBytes(old),
      newBytes = jsonBytes(target);
    const operation = {
      schemaVersion: 1,
      id: pointer.id,
      oldManifestHash: upgradeHash(oldBytes),
      newManifestHash: upgradeHash(newBytes),
      target,
      instructions: null,
      manifestMode: 0o644,
      entries: [
        {
          path: "file",
          beforeHash: old.files.file.sha256,
          afterHash: target.files.file.sha256,
          beforeMode: 0o644,
          afterMode: 0o644,
        },
      ],
      guards: [],
      directories: [],
    };
    expect(validateOperation(operation, pointer, oldBytes, newBytes).entries).toHaveLength(1);
    for (const path of ["../escape", "site/a", ".lace/file", "lace.config.ts"])
      expect(() =>
        validateOperation(
          { ...operation, entries: [{ ...operation.entries[0], path }] },
          pointer,
          oldBytes,
          newBytes,
        ),
      ).toThrow();
    for (const delta of [
      { schemaVersion: 2 },
      { oldManifestHash: "0".repeat(64) },
      { entries: [] },
      { entries: [{ ...operation.entries[0], beforeMode: 0o4777 }] },
      { extra: true },
    ])
      expect(() =>
        validateOperation({ ...operation, ...delta }, pointer, oldBytes, newBytes),
      ).toThrow();
    expect(() => validatePointer({ ...pointer, id: "../escape" })).toThrow();
    expect(() => validatePointer({ ...pointer, schemaVersion: 2 })).toThrow();
  });
});
