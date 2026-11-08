// @ts-nocheck
// TODO(rf2): Type mutable transport fixtures and deliberately malformed metadata.
import * as v from "valibot";
import { expect, test } from "vitest";

test("admin build diagnostics validate closed reasons and coherent safe paths", async () => {
  const { siteBuildRecordSchema } = await import("./site-builds.js");
  const base = {
    id: "build",
    reason: "manual",
    status: "failed",
    targetVersion: 1,
    requestedBy: "admin",
    requestedAt: "2026-10-05T00:00:00.000Z",
  };
  expect(v.safeParse(siteBuildRecordSchema, { ...base, error: "install_failed" }).success).toBe(
    true,
  );
  expect(
    v.safeParse(siteBuildRecordSchema, {
      ...base,
      error: "source_symlink",
      errorPath: "src/linked.astro",
    }).success,
  ).toBe(true);
  for (const item of [
    { error: "unknown" },
    { errorPath: "src/a" },
    { error: "install_failed", errorPath: "src/a" },
    { error: "source_missing", errorPath: "/host/root" },
    { error: "source_missing", errorPath: ".env" },
  ])
    expect(v.safeParse(siteBuildRecordSchema, { ...base, ...item }).success).toBe(false);
});

test("admin build DTOs accept exactly the seven lifecycle statuses", async () => {
  const { siteBuildRecordSchema, siteBuildStatusSchema, toSiteBuildRecordDto } =
    await import("./site-builds.js");
  const base = {
    id: "build",
    reason: "publication",
    targetVersion: 4,
    requestedBy: "admin",
    requestedAt: "2026-10-05T00:00:00.000Z",
  };
  expect(siteBuildStatusSchema.options).toEqual([
    "pending",
    "running",
    "accepted",
    "succeeded",
    "failed",
    "cancelled",
    "unknown",
  ]);
  for (const status of siteBuildStatusSchema.options)
    expect(v.safeParse(siteBuildRecordSchema, { ...base, status }).success).toBe(true);
  for (const status of ["deployed", "Accepted", ""])
    expect(v.safeParse(siteBuildRecordSchema, { ...base, status }).success).toBe(false);
  expect(
    toSiteBuildRecordDto({
      id: "build",
      reason: "publication",
      status: "accepted",
      targetVersion: 4,
      requestedBy: "admin",
      requestedAt: 1,
      startedAt: 2,
      completedAt: 3,
      providerBuildId: "dep-1",
    }),
  ).toMatchObject({
    status: "accepted",
    providerBuildId: "dep-1",
    completedAt: expect.any(String),
  });
});

test("admin build DTOs carry tracking stage, last check and tracking reasons", async () => {
  const { siteBuildRecordSchema, toSiteBuildRecordDto } = await import("./site-builds.js");
  const base = {
    id: "build",
    reason: "publication",
    status: "running",
    targetVersion: 4,
    requestedBy: "admin",
    requestedAt: "2026-10-05T00:00:00.000Z",
  };
  const tracked = toSiteBuildRecordDto({
    ...base,
    requestedAt: 1,
    providerBuildId: "dep-1",
    providerStage: "build",
    providerCheckedAt: 5,
  });
  expect(tracked).toMatchObject({
    providerStage: "build",
    providerCheckedAt: "1970-01-01T00:00:00.005Z",
  });
  expect(v.safeParse(siteBuildRecordSchema, tracked).success).toBe(true);
  for (const stage of ["queued", "initialize", "clone_repo", "build", "deploy"])
    expect(v.safeParse(siteBuildRecordSchema, { ...base, providerStage: stage }).success).toBe(
      true,
    );
  for (const stage of ["upload", "Deploy", ""])
    expect(v.safeParse(siteBuildRecordSchema, { ...base, providerStage: stage }).success).toBe(
      false,
    );
  expect(
    v.safeParse(siteBuildRecordSchema, { ...base, providerCheckedAt: "yesterday" }).success,
  ).toBe(false);
  for (const error of [
    "provider_build_failed",
    "provider_deploy_failed",
    "provider_cancelled",
    "provider_skipped",
    "tracking_forbidden",
    "tracking_not_found",
    "tracking_rejected",
    "tracking_timeout",
    "tracking_unconfigured",
  ]) {
    expect(v.safeParse(siteBuildRecordSchema, { ...base, status: "unknown", error }).success).toBe(
      true,
    );
    expect(
      v.safeParse(siteBuildRecordSchema, { ...base, error, errorPath: "src/page.astro" }).success,
    ).toBe(false);
  }
});
