import { expect, test } from "vitest";
import { readFile } from "node:fs/promises";

test("site-build status SQL mirrors the portable vocabulary", async () => {
  const { siteBuildStatuses, retryableSiteBuildStatuses } = await import("@lacecms/domain");
  const { RETRYABLE_SITE_BUILD_STATUS_SQL, siteBuildRecord } = await import("./site-builds.js");
  const migration = await readFile(
    new URL("../../drizzle/0000_baseline.sql", import.meta.url),
    "utf8",
  );
  const check = /CHECK\("site_builds"\."status" in \(([^)]*)\)\)/u.exec(migration)?.[1];
  expect(check?.split(", ")).toEqual(siteBuildStatuses.map((status) => `'${status}'`));
  expect(RETRYABLE_SITE_BUILD_STATUS_SQL).toBe(
    `(${retryableSiteBuildStatuses.map((status) => `'${status}'`).join(", ")})`,
  );
  expect(migration).not.toMatch(/^\s*PRAGMA/imu);
  const row = {
    completed_at: null,
    error: null,
    id: "build-1",
    provider_build_id: null,
    reason: "manual",
    requested_at: 1,
    requested_by: "admin",
    started_at: null,
    status: "deployed",
    target_version: 1,
  };
  // This deliberately invalid persisted status exercises row validation.
  expect(() => siteBuildRecord(row as Parameters<typeof siteBuildRecord>[0])).toThrow(
    expect.objectContaining({ code: "CONTENT_INVALID_STATE" }),
  );
  expect(siteBuildRecord({ ...row, status: "accepted" as const }).status).toBe("accepted");
});
