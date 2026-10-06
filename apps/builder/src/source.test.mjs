import { mkdtemp, mkdir, writeFile, rm, symlink, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, expect, test } from "vitest";
import { validateSource, copySource } from "../dist/index.js";

const roots = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});
async function fixture(siteDirectory = "site") {
  const root = await mkdtemp(join(tmpdir(), "lace-selection-"));
  roots.push(root);
  const source = join(root, "source");
  await mkdir(join(source, siteDirectory), { recursive: true });
  await writeFile(join(source, "package.json"), "{}");
  await writeFile(join(source, "pnpm-lock.yaml"), "lockfileVersion: '9.0'");
  if (siteDirectory !== ".")
    await writeFile(join(source, "pnpm-workspace.yaml"), `packages:\n  - ${siteDirectory}\n`);
  await writeFile(
    join(source, siteDirectory, "package.json"),
    JSON.stringify({ dependencies: { astro: "7.3.1" } }),
  );
  return { root, source, selection: { siteDirectory, outputDirectory: "dist" } };
}
test.each(["site", ".", "web/frontend"])("accepts explicit installation %s", async (site) => {
  const { source, selection } = await fixture(site);
  await expect(validateSource(source, selection)).resolves.toBeUndefined();
});
test.each([
  "/host/private",
  "../site",
  "web/../site",
  "web//site",
  "--root",
  "site\\other",
  "site\nother",
  "",
])("rejects unsafe selection %s", async (siteDirectory) => {
  const { source, selection } = await fixture();
  await expect(validateSource(source, { ...selection, siteDirectory })).rejects.toThrow();
  await expect(
    validateSource(source, { ...selection, outputDirectory: siteDirectory }),
  ).rejects.toThrow();
});
test("requires accessible regular lockfile and Astro package without nested installation", async () => {
  const { source, selection } = await fixture();
  await writeFile(join(source, "site/pnpm-lock.yaml"), "{}");
  await expect(validateSource(source, selection)).rejects.toThrow();
  await rm(join(source, "site/pnpm-lock.yaml"));
  await writeFile(join(source, "site/package.json"), "{}");
  await expect(validateSource(source, selection)).rejects.toThrow();
  await writeFile(
    join(source, "site/package.json"),
    JSON.stringify({ devDependencies: { astro: "7.3.1" } }),
  );
  await rm(join(source, "pnpm-lock.yaml"));
  await expect(validateSource(source, selection)).rejects.toThrow();
  await expect(validateSource(join(source, "absent"), selection)).rejects.toThrow();
});
test("rejects symbolic-link components and output overlapping source", async () => {
  const { source, selection } = await fixture();
  await symlink("site", join(source, "linked"));
  await expect(validateSource(source, { ...selection, siteDirectory: "linked" })).rejects.toThrow();
  await symlink("../site", join(source, "site/output"));
  await expect(
    validateSource(source, { ...selection, outputDirectory: "output" }),
  ).rejects.toThrow();
  await expect(
    validateSource(source, { ...selection, outputDirectory: "src/pages" }),
  ).rejects.toThrow();
});
test("copy excludes configured output and nested CMS data without changing source", async () => {
  const { root, source, selection } = await fixture();
  for (const file of [
    "site/release/index.html",
    "cms/.lace/data/lace.sqlite",
    "cms/.env",
    ".env.production",
    "node_modules/fake/index.js",
    "site/src/pages/index.astro",
  ]) {
    await mkdir(join(source, file, ".."), { recursive: true });
    await writeFile(join(source, file), "sentinel");
  }
  const destination = join(root, "copy");
  await copySource(source, destination, { ...selection, outputDirectory: "release" });
  for (const file of [
    "site/release/index.html",
    "cms/.lace/data/lace.sqlite",
    "cms/.env",
    ".env.production",
    "node_modules/fake/index.js",
  ]) {
    await expect(readFile(join(destination, file))).rejects.toThrow();
    expect(await readFile(join(source, file), "utf8")).toBe("sentinel");
  }
  expect(await readFile(join(destination, "site/src/pages/index.astro"), "utf8")).toBe("sentinel");
});

test.each(["site", "."])("root service links are excluded for %s", async (site) => {
  const { root, source, selection } = await fixture(site);
  await symlink("../absent-secret-target", join(source, "AGENTS.md"));
  await symlink("AGENTS.md", join(source, "CLAUDE.md"));
  await copySource(source, join(root, "copy"), selection);
  for (const name of ["AGENTS.md", "CLAUDE.md"])
    await expect(readFile(join(root, "copy", name))).rejects.toThrow();
});
test.each(["package.json", "pnpm-lock.yaml", "pnpm-workspace.yaml", "site/package.json"])(
  "identifies missing required %s",
  async (path) => {
    const { source, selection } = await fixture();
    await rm(join(source, path));
    await expect(validateSource(source, selection)).rejects.toMatchObject({
      reason: "source_missing",
      path,
    });
  },
);
test.each(["site/linked.astro", "site/CLAUDE.md", "escape", "site/unsafe\nname", "site/é"])(
  "rejects included link without its target: %s",
  async (path) => {
    const { root, source, selection } = await fixture();
    await symlink("/outside/secret-sentinel", join(source, path));
    const error = await copySource(source, join(root, "copy"), selection).catch((error) => error);
    expect(error.reason).toBe("source_symlink");
    expect(error.path).toBe(/\n|é/u.test(path) ? undefined : path);
    expect(JSON.stringify(error)).not.toContain("secret-sentinel");
  },
);
test("identifies linked required file and special entry", async () => {
  const { root, source, selection } = await fixture();
  await rm(join(source, "pnpm-lock.yaml"));
  await symlink("package.json", join(source, "pnpm-lock.yaml"));
  await expect(validateSource(source, selection)).rejects.toMatchObject({
    reason: "source_symlink",
    path: "pnpm-lock.yaml",
  });
  await rm(join(source, "pnpm-lock.yaml"));
  await writeFile(join(source, "pnpm-lock.yaml"), "{}");
  const { execFileSync } = await import("node:child_process");
  execFileSync("mkfifo", [join(source, "site/fifo")]);
  await expect(copySource(source, join(root, "copy"), selection)).rejects.toMatchObject({
    reason: "source_special_file",
    path: "site/fifo",
  });
});
test.skipIf(process.getuid?.() === 0)(
  "identifies unreadable included entry and recovers after correction",
  async () => {
    const { chmod } = await import("node:fs/promises");
    const { root, source, selection } = await fixture();
    const file = join(source, "site/unreadable");
    await writeFile(file, "private");
    await chmod(file, 0);
    try {
      await expect(copySource(source, join(root, "failed-copy"), selection)).rejects.toMatchObject({
        reason: "source_unreadable",
        path: "site/unreadable",
      });
    } finally {
      await chmod(file, 0o644);
    }
    await expect(copySource(source, join(root, "retry-copy"), selection)).resolves.toBeUndefined();
  },
);
