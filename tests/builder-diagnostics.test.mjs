import { expect, test } from "vitest";
import * as portable from "../packages/domain/dist/build-diagnostics.js";
import * as builder from "../apps/builder/dist/diagnostics.js";
test("standalone builder protocol matches portable diagnostic rules", () => {
  expect(builder.siteBuildFailureReasons).toEqual(portable.siteBuildFailureReasons);
  expect(builder.sourceFailureReasons).toEqual(portable.sourceFailureReasons);
  for (const reason of [...portable.siteBuildFailureReasons, "unknown"]) {
    for (const path of [
      undefined,
      "src/a.astro",
      "/source/a",
      "../a",
      ".env",
      "cms/.lace/data/file",
      "a".repeat(512),
      "a".repeat(513),
    ])
      expect(builder.normalizeBuildFailure(reason, path)).toEqual(
        portable.normalizeBuildFailure(reason, path),
      );
  }
});

test("stored errors support legacy data and sanitize structured records", async () => {
  const { encodeBuildError, buildErrorRecord } = await import("../packages/db/dist/index.js");
  expect(buildErrorRecord("install_failed")).toEqual({ error: "install_failed" });
  expect(buildErrorRecord(encodeBuildError("source_missing", "pnpm-lock.yaml"))).toEqual({
    error: "source_missing",
    errorPath: "pnpm-lock.yaml",
  });
  expect(buildErrorRecord('{"reason":"source_symlink","path":"/host/private"}')).toEqual({
    error: "source_symlink",
  });
  for (const value of [
    '{"reason":"unknown","path":"src/file"}',
    '{"reason":"source_missing","secret":"private"}',
    '{"reason":',
    "private-token",
    '{"reason":"source_missing","path":3}',
  ])
    expect(buildErrorRecord(value)).toEqual({ error: "provider_failed" });
});
