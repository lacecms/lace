import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { runBuildProcess } from "./process.js";
import { previewExecutionSignal } from "./preview-deadline.js";

test("stopping preview kills both the command and its descendant before returning", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "lace-preview-process-"));
  const controller = new AbortController();
  const signal = previewExecutionSignal(Date.now(), Date.now() + 4000, controller.signal);
  try {
    const command = runBuildProcess({
      executable: "/bin/sh",
      args: ["-c", "(sleep 2; echo survived > marker) & echo $! > spawned; wait"],
      cwd,
      env: { PATH: process.env.PATH },
      phase: "test",
      signal,
    });
    await expect
      .poll(() => readFile(join(cwd, "spawned"), "utf8").catch(() => ""))
      .toMatch(/^\d+/u);
    controller.abort();
    expect((await command).success).toBe(false);
    await expect(readFile(join(cwd, "marker"))).rejects.toMatchObject({ code: "ENOENT" });
  } finally {
    controller.abort();
    await rm(cwd, { recursive: true, force: true });
  }
});

test("an already elapsed overall deadline closes execution immediately", () => {
  const now = Date.now();
  expect(previewExecutionSignal(now - 500, now - 1, new AbortController().signal).aborted).toBe(
    true,
  );
});
