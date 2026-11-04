import { expect, test } from "vitest";
import {
  normalizeBuildFailure,
  safeBuildSourcePath,
  siteBuildFailureReasons,
} from "./diagnostics.js";

test("build diagnostics preserve known reasons and reject unsafe paths", () => {
  for (const reason of siteBuildFailureReasons)
    expect(normalizeBuildFailure(reason).reason).toBe(reason);
  expect(normalizeBuildFailure("secret /host/root", "src/file")).toEqual({
    reason: "provider_failed",
  });
  expect(normalizeBuildFailure("source_symlink", "src/file.astro")).toEqual({
    reason: "source_symlink",
    path: "src/file.astro",
  });
  expect(normalizeBuildFailure("install_failed", "src/file")).toEqual({ reason: "install_failed" });
  for (const path of [
    "",
    ".",
    "..",
    "/source/file",
    "C:/file",
    "src/../file",
    "src//file",
    "src/./file",
    "--file",
    "src/--file",
    "src\\file",
    "src/é",
    "src/line\n",
    "a".repeat(513),
    ".env",
    "cms/.env.production",
    ".git/config",
    ".aws/key",
    "cms/.lace/data/db",
    ".npmrc",
    ".ssh/key",
    ".agents/a",
    ".codex/a",
    ".claude/a",
    ".pnpmfile.cjs",
  ])
    expect(safeBuildSourcePath(path), path).toBeUndefined();
  for (const path of ["pnpm-lock.yaml", "web/src/page.astro", "src/a b.txt", "a".repeat(512)])
    expect(safeBuildSourcePath(path)).toBe(path);
});
