// @ts-nocheck
// TODO(rf2): Type mutable transport fixtures and deliberately malformed metadata.
import * as v from "valibot";
import { describe, expect, test } from "vitest";
import { accountSessionSchema, sessionRevocationResultSchema } from "../index.js";

describe("account lifecycle contracts", () => {
  const token = "A".repeat(43);
  const ok = (schema, value) => v.safeParse(schema, value).success;
  test("session records reject tokens and IP addresses", () => {
    const session = {
      browser: "Firefox",
      createdAt: "2026-10-10T12:00:00.000Z",
      current: true,
      id: "session-1",
      lastActiveAt: "2026-10-10T13:00:00.000Z",
      os: "Linux",
    };
    expect(ok(accountSessionSchema, session)).toBe(true);
    expect(ok(accountSessionSchema, { ...session, token })).toBe(false);
    expect(ok(accountSessionSchema, { ...session, ipAddress: "203.0.113.5" })).toBe(false);
    expect(ok(accountSessionSchema, { ...session, browser: "Netscape" })).toBe(false);
    expect(ok(sessionRevocationResultSchema, { revoked: 2 })).toBe(true);
    expect(ok(sessionRevocationResultSchema, { revoked: -1 })).toBe(false);
  });
});
