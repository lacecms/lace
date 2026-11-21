import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { pinPreviewSource, stagePreviewSource } from "./preview-source.js";
import { parsePreviewRunnerSettings } from "./preview-settings.js";

const selection = { siteDirectory: ".", outputDirectory: "dist" };

test("preview stages the pinned Git tree and excludes worktree runtime data", async () => {
  const scratch = await mkdtemp(join(tmpdir(), "lace-preview-source-"));
  const root = join(scratch, "source");
  const project = join(scratch, "project");
  await mkdir(join(root, ".lace/data"), { recursive: true });
  const git = (...args: string[]) => execFileSync("git", ["-C", root, ...args], { stdio: "pipe" });
  try {
    git("init");
    git("config", "user.name", "Lace");
    git("config", "user.email", "lace@example.test");
    await writeFile(join(root, ".env"), "tracked secret");
    await writeFile(join(root, "package.json"), '{"dependencies":{"astro":"7.4.12"}}');
    await writeFile(join(root, "pnpm-lock.yaml"), "first lock");
    git("add", ".");
    git("commit", "-m", "Initial source");
    await writeFile(join(root, ".env"), "changed secret");
    await writeFile(join(root, ".lace/data", "db"), "private data");
    const first = await pinPreviewSource(root, selection);
    await writeFile(join(root, "pnpm-lock.yaml"), "second lock");
    await expect(pinPreviewSource(root, selection)).rejects.toMatchObject({ detail: "dirty" });
    git("add", "pnpm-lock.yaml");
    git("commit", "-m", "Update lock");
    expect(await pinPreviewSource(root, selection)).not.toBe(first);
    await writeFile(join(root, "untracked.astro"), "new source");
    await expect(pinPreviewSource(root, selection)).rejects.toMatchObject({ detail: "dirty" });
    await stagePreviewSource(root, first, project, selection, new AbortController().signal);
    expect(await readFile(join(project, "pnpm-lock.yaml"), "utf8")).toBe("first lock");
    for (const path of [".git", ".env", ".lace/data/db", "untracked.astro"])
      await expect(readFile(join(project, path))).rejects.toMatchObject({ code: "ENOENT" });

    await symlink("package.json", join(root, "linked.json"));
    git("add", "untracked.astro", "linked.json");
    git("commit", "-m", "Add unsupported source");
    await expect(
      stagePreviewSource(
        root,
        await pinPreviewSource(root, selection),
        join(scratch, "unsupported"),
        selection,
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({ detail: "unsupported" });
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
});

test("preview runner requires separate configured credentials and a public site URL", () => {
  const environment = {
    LACE_PREVIEW_BUILDER_SECRET: "b".repeat(32),
    LACE_PREVIEW_ENABLED: "true",
    LACE_PREVIEW_RUNNER_SECRET: "r".repeat(32),
  };
  const site = "https://example.test/base";
  expect(parsePreviewRunnerSettings(environment, undefined)).toBeUndefined();
  expect(
    parsePreviewRunnerSettings({ ...environment, LACE_BUILDER_SECRET: "b".repeat(32) }, site),
  ).toBeUndefined();
  expect(parsePreviewRunnerSettings(environment, site)).toEqual({
    secret: "b".repeat(32),
    bootstrapSecret: "r".repeat(32),
    siteUrl: site,
  });
});
