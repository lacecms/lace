import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import {
  inspectPackageMedia,
  isSafeRelativePath,
  readVerifiedMedia,
} from "../dist/import-files.js";

const png = (seed = 0) =>
  new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, seed, 0, 0, 0]);
const temporary = [];

async function packageDir() {
  const parent = await realpath(await mkdtemp(join(tmpdir(), "lace-import-files-")));
  temporary.push(parent);
  const root = join(parent, "pkg");
  await mkdir(join(root, "media"), { recursive: true });
  await writeFile(join(parent, "secret.png"), png(9));
  return root;
}

afterEach(async () => {
  for (const path of temporary.splice(0)) await rm(path, { recursive: true, force: true });
});

describe("package media files", () => {
  test("path syntax refuses traversal, absolute, backslash and empty segments", () => {
    expect(isSafeRelativePath("media/hero.png")).toBe(true);
    for (const path of ["../x.png", "/etc/x.png", "a\\b.png", "a//b.png", "./a.png", "C:/a.png"])
      expect(isSafeRelativePath(path)).toBe(false);
  });

  test("reports traversal, escaping links, directories, size, format and metadata twins", async () => {
    const root = await packageDir();
    await writeFile(join(root, "media/ok.png"), png(1));
    await writeFile(join(root, "media/copy.png"), png(1));
    await writeFile(
      join(root, "media/fake.png"),
      new TextEncoder().encode("%PDF-1.7 not an image"),
    );
    await writeFile(join(root, "media/big.png"), new Uint8Array(10 * 1024 * 1024 + 1));
    await symlink(join(root, "../secret.png"), join(root, "media/link.png"));
    const issues = [];
    const result = await inspectPackageMedia(
      root,
      [
        { key: "ok", file: "media/ok.png", alt: "Same", tags: ["Project-A"] },
        { key: "up", file: "../secret.png" },
        { key: "link", file: "media/link.png" },
        { key: "dir", file: "media" },
        { key: "big", file: "media/big.png" },
        { key: "fake", file: "media/fake.png" },
        { key: "copy", file: "media/copy.png", alt: "Different" },
        { key: "tags", file: "media/ok.png", alt: "Same", tags: ["bad,tag"] },
        { key: "missing", file: "media/none.png" },
      ],
      issues,
    );
    expect(issues.map((issue) => issue.pointer)).toEqual([
      "/media/1/file",
      "/media/2/file",
      "/media/3/file",
      "/media/4/file",
      "/media/5/file",
      "/media/6",
      "/media/7/tags/0",
      "/media/8/file",
    ]);
    expect(issues.map((issue) => issue.message).join(" ")).not.toContain("PDF");
    expect(result.metadata.get("ok")).toEqual({ alt: "Same", tags: ["project-a"] });
    expect(result.files.get("ok")).toMatchObject({ filename: "ok.png", mimeType: "image/png" });
    expect(result.files.get("ok").sha256).toMatch(/^[0-9a-f]{64}$/u);
  });

  test("identical bytes with identical metadata are accepted; changed files fail upload", async () => {
    const root = await packageDir();
    await writeFile(join(root, "media/a.png"), png(2));
    await writeFile(join(root, "media/b.png"), png(2));
    const issues = [];
    const { files } = await inspectPackageMedia(
      root,
      [
        { key: "a", file: "media/a.png", alt: "x" },
        { key: "b", file: "media/b.png", alt: "x" },
      ],
      issues,
    );
    expect(issues).toEqual([]);
    expect((await readVerifiedMedia("a", files.get("a"))).byteLength).toBe(12);
    await writeFile(join(root, "media/a.png"), png(3));
    await expect(readVerifiedMedia("a", files.get("a"))).rejects.toMatchObject({
      code: "IMPORT_FAILED",
    });
  });

  test("invalid alt text is located by the server's metadata rules", async () => {
    const root = await packageDir();
    await writeFile(join(root, "media/a.png"), png(4));
    const issues = [];
    await inspectPackageMedia(root, [{ key: "a", file: "media/a.png", alt: "x\ny" }], issues);
    expect(issues.map((issue) => issue.pointer)).toEqual(["/media/0/alt"]);
  });
});
