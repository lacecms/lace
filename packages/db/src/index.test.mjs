import { expect, test } from "vitest";
import { readFile } from "node:fs/promises";
import {
  assertDraftPersistenceBounds,
  decodeBase64Url,
  decodeCursor,
  encodeBase64Url,
  encodeCursor,
  encodeSortCursor,
  packageName,
  checkedInMigrations,
  sqliteWriteError,
} from "../dist/index.js";

test("exports its package identity", () => expect(packageName).toBe("@lacecms/db"));

test("checked-in migration inventory matches the Drizzle journal", async () => {
  const journal = JSON.parse(
    await readFile(new URL("../drizzle/meta/_journal.json", import.meta.url), "utf8"),
  );
  expect(checkedInMigrations).toEqual(
    journal.entries.map((entry) => ({
      createdAt: entry.when,
      name: `${entry.tag}.sql`,
    })),
  );
});

test("encodes cursors byte-identically to Node Buffer base64url", () => {
  for (const text of ["", "a", "ab", "abc", '{"kind":"é✓😀","id":"x"}', "\u0000ÿ/+?"]) {
    expect(encodeBase64Url(text)).toBe(Buffer.from(text).toString("base64url"));
    expect(decodeBase64Url(encodeBase64Url(text))).toBe(text);
  }
  const payload = { id: "e-1", kind: "public:posts", timestamp: 7, version: 1 };
  expect(encodeCursor("public:posts", 7, "e-1")).toBe(
    Buffer.from(JSON.stringify(payload)).toString("base64url"),
  );
  expect(decodeCursor(encodeCursor("public:posts", 7, "e-1"), "public:posts")).toEqual({
    id: "e-1",
    timestamp: 7,
  });
  expect(encodeSortCursor("k", "Ünïcode", "id")).toBe(
    Buffer.from(JSON.stringify({ id: "id", kind: "k", value: "Ünïcode", version: 2 })).toString(
      "base64url",
    ),
  );
  for (const invalid of ["not a cursor", "a", encodeBase64Url("[]")]) {
    expect(() => decodeCursor(invalid, "public:posts")).toThrow(
      expect.objectContaining({ code: "CONTENT_INVALID_STATE" }),
    );
  }
});

test("bounds drafts and maps SQLite constraint failures to stable codes", () => {
  expect(() => assertDraftPersistenceBounds(new Array(200), new Array(200))).not.toThrow();
  expect(() => assertDraftPersistenceBounds(new Array(201), [])).toThrow(
    expect.objectContaining({ code: "CONTENT_INVALID_STATE" }),
  );
  expect(() => assertDraftPersistenceBounds([], new Array(201))).toThrow(
    expect.objectContaining({ code: "CONTENT_INVALID_STATE" }),
  );
  const mapped = (message, page = false) => {
    try {
      sqliteWriteError(new Error(message), page, "Test");
    } catch (error) {
      return [error.code, error.message];
    }
  };
  expect(mapped("D1_ERROR: UNIQUE constraint failed: published_routes.path: SQLITE")).toEqual([
    "CONTENT_ROUTE_CONFLICT",
    "The public path belongs to another entry.",
  ]);
  expect(mapped("UNIQUE constraint failed: content_entries.model_key", true)[0]).toBe(
    "CONTENT_MODEL_CARDINALITY_CONFLICT",
  );
  expect(mapped("NOT NULL constraint failed: content_media_references.media_id")).toEqual([
    "CONTENT_INVALID_STATE",
    "Media is unavailable for reference.",
  ]);
  expect(mapped("anything else")).toEqual(["CONTENT_INVALID_STATE", "Test content write failed."]);
});

test("site-build status SQL mirrors the portable vocabulary", async () => {
  const { siteBuildStatuses, retryableSiteBuildStatuses } = await import("@lacecms/domain");
  const { RETRYABLE_SITE_BUILD_STATUS_SQL, siteBuildRecord } = await import("../dist/index.js");
  const migration = await readFile(
    new URL("../drizzle/0003_site_build_outcomes.sql", import.meta.url),
    "utf8",
  );
  const check = /CHECK\("status" in \(([^)]*)\)\)/u.exec(migration)?.[1];
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
  expect(() => siteBuildRecord(row)).toThrow(
    expect.objectContaining({ code: "CONTENT_INVALID_STATE" }),
  );
  expect(siteBuildRecord({ ...row, status: "accepted" }).status).toBe("accepted");
});
