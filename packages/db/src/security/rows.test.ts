import { expect, test } from "vitest";
import {
  ACTIVE_INVITATION_SQL,
  INVITATION_COLUMNS_SQL,
  buildTokenMetadata,
  invitationRecord,
  isUniqueViolation,
  managedUser,
  normalizedEmail,
  securityRole,
  sessionRecord,
  userProfile,
} from "./rows.js";

test("accepts only the three security roles", () => {
  expect(securityRole("admin")).toBe("admin");
  expect(securityRole("editor")).toBe("editor");
  expect(securityRole("viewer")).toBe("viewer");
  expect(() => securityRole("owner")).toThrow(new TypeError("Invalid role."));
  expect(() => securityRole(undefined)).toThrow(TypeError);
});

test("maps users with integer, string or bigint disabled flags", () => {
  const row = { disabled: 0, email: "a@example.test", id: "u1", role: "editor" };
  expect(managedUser(row)).toEqual({
    disabled: false,
    email: "a@example.test",
    id: "u1",
    role: "editor",
  });
  expect(managedUser({ ...row, disabled: 1 }).disabled).toBe(true);
  expect(managedUser({ ...row, disabled: "1" }).disabled).toBe(true);
  expect(managedUser({ ...row, disabled: 1n }).disabled).toBe(true);
  expect(Object.isFrozen(managedUser(row))).toBe(true);
  expect(() => managedUser({ ...row, role: "root" })).toThrow(TypeError);
});

test("omits a blank profile name and trims a present one", () => {
  expect(userProfile({ disabled: 0, email: "a@example.test", name: "  " })).toEqual({
    disabled: false,
    email: "a@example.test",
  });
  expect(userProfile({ disabled: 1, email: "a@example.test", name: null })).toEqual({
    disabled: true,
    email: "a@example.test",
  });
  expect(userProfile({ disabled: 0, email: "a@example.test", name: " Ada " })).toEqual({
    disabled: false,
    email: "a@example.test",
    name: "Ada",
  });
});

test("names the inviter or falls back to the actor display name", () => {
  const row = {
    created_at: 1,
    email: "b@example.test",
    expires_at: 2,
    id: "i1",
    invited_by: "u1",
    inviter_name: "Ada",
    role: "viewer",
  };
  expect(invitationRecord(row)).toEqual({
    createdAt: 1,
    email: "b@example.test",
    expiresAt: 2,
    id: "i1",
    invitedBy: "u1",
    invitedByName: "Ada",
    role: "viewer",
  });
  const fallback = invitationRecord({ ...row, inviter_name: null }).invitedByName;
  expect(fallback).not.toBe("Ada");
  expect(fallback.length).toBeGreaterThan(0);
});

test("includes a session user agent only when present", () => {
  const row = { created_at: 1, id: "s1", updated_at: 3 };
  expect(sessionRecord({ ...row, user_agent: "" })).toEqual({
    createdAt: 1,
    id: "s1",
    lastActiveAt: 3,
  });
  expect(sessionRecord({ ...row, user_agent: "Browser" })).toEqual({
    createdAt: 1,
    id: "s1",
    lastActiveAt: 3,
    userAgent: "Browser",
  });
});

test("includes build-token usage and revocation only when set", () => {
  const row = {
    created_at: 1,
    id: "t1",
    last_used_at: null,
    name: "Site",
    revoked_at: null,
    token_prefix: "abcd1234",
  };
  expect(buildTokenMetadata(row)).toEqual({
    capabilities: ["content:build:read"],
    createdAt: 1,
    id: "t1",
    name: "Site",
    tokenPrefix: "abcd1234",
  });
  expect(buildTokenMetadata({ ...row, last_used_at: 5, revoked_at: 6 })).toMatchObject({
    lastUsedAt: 5,
    revokedAt: 6,
  });
});

test("normalizes emails and rejects values without an address", () => {
  expect(normalizedEmail("  Ada@Example.TEST ")).toBe("ada@example.test");
  expect(() => normalizedEmail("   ")).toThrow(new TypeError("Invalid email."));
  expect(() => normalizedEmail("ada.example.test")).toThrow(TypeError);
});

test("detects SQLite unique violations only", () => {
  expect(isUniqueViolation(new Error("UNIQUE constraint failed: invitations.email"))).toBe(true);
  expect(isUniqueViolation(new Error("FOREIGN KEY constraint failed"))).toBe(false);
  expect(isUniqueViolation("UNIQUE constraint failed")).toBe(false);
});

test("keeps the invitation SQL fragments", () => {
  expect(INVITATION_COLUMNS_SQL).toContain("u.name as inviter_name");
  expect(ACTIVE_INVITATION_SQL).toBe("accepted_at is null and revoked_at is null");
});
