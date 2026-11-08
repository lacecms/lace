// @ts-nocheck
// TODO(rf2): Type mutable transport fixtures and deliberately malformed metadata.
import * as v from "valibot";
import { describe, expect, test } from "vitest";
import {
  accountPasswordChangeRequestSchema,
  accountProfileUpdateRequestSchema,
  adminPasswordResetResultSchema,
  invitationAcceptRequestSchema,
  invitationCreateRequestSchema,
  invitationIssueResultSchema,
  invitationListSchema,
  passwordResetConfirmRequestSchema,
  passwordResetRequestSchema,
} from "./invitations.js";

describe("account lifecycle contracts", () => {
  const token = "A".repeat(43);
  const invitation = {
    createdAt: "2026-10-10T12:00:00.000Z",
    email: "new@example.com",
    expiresAt: "2026-10-13T12:00:00.000Z",
    id: "inv-1",
    invitedBy: "Ada",
    role: "editor",
    state: "pending",
  };
  const link = `https://cms.example.com/admin/accept-invite#token=${token}`;
  const ok = (schema, value) => v.safeParse(schema, value).success;
  test("issue results carry a link only when delivery was not sent", () => {
    expect(ok(invitationIssueResultSchema, { delivery: { status: "sent" }, invitation })).toBe(
      true,
    );
    expect(
      ok(invitationIssueResultSchema, { delivery: { status: "sent" }, invitation, link }),
    ).toBe(false);
    const failed = { reason: "not_configured", status: "failed" };
    expect(ok(invitationIssueResultSchema, { delivery: failed, invitation, link })).toBe(true);
    expect(ok(invitationIssueResultSchema, { delivery: failed, invitation })).toBe(false);
    expect(
      ok(invitationIssueResultSchema, {
        delivery: failed,
        invitation,
        link: "https://cms.example.com/admin/accept-invite?token=" + token,
      }),
    ).toBe(false);
    expect(ok(adminPasswordResetResultSchema, { delivery: { status: "sent" } })).toBe(true);
    expect(ok(adminPasswordResetResultSchema, { delivery: { status: "sent" }, link })).toBe(false);
    expect(ok(adminPasswordResetResultSchema, { delivery: failed, link })).toBe(true);
    expect(ok(adminPasswordResetResultSchema, { delivery: failed })).toBe(false);
  });
  test("invitation listings never carry tokens or links", () => {
    expect(ok(invitationListSchema, { items: [invitation] })).toBe(true);
    expect(ok(invitationListSchema, { items: [{ ...invitation, token }] })).toBe(false);
    expect(ok(invitationListSchema, { items: [{ ...invitation, link }] })).toBe(false);
    expect(ok(invitationListSchema, { items: [{ ...invitation, state: "accepted" }] })).toBe(false);
  });
  test("passwords, tokens and display names are bounded", () => {
    const short = "x".repeat(11);
    const result = v.safeParse(invitationAcceptRequestSchema, { password: short, token });
    expect(result.success).toBe(false);
    expect(result.issues.map((issue) => issue.path.map((item) => item.key).join("/"))).toEqual([
      "password",
    ]);
    expect(ok(passwordResetConfirmRequestSchema, { password: short, token })).toBe(false);
    expect(ok(passwordResetConfirmRequestSchema, { password: "x".repeat(12), token })).toBe(true);
    expect(ok(passwordResetConfirmRequestSchema, { password: "x".repeat(1_025), token })).toBe(
      false,
    );
    expect(
      ok(passwordResetConfirmRequestSchema, { password: "x".repeat(12), token: "short" }),
    ).toBe(false);
    expect(
      ok(invitationAcceptRequestSchema, { displayName: "Ada", password: "x".repeat(12), token }),
    ).toBe(true);
    for (const displayName of ["   ", "x".repeat(121), "Ada\u0007", "Ada\nLovelace"])
      expect(ok(accountProfileUpdateRequestSchema, { displayName })).toBe(false);
    expect(ok(accountProfileUpdateRequestSchema, { displayName: "  Ada Lovelace " })).toBe(true);
    expect(
      ok(accountPasswordChangeRequestSchema, {
        currentPassword: "old",
        newPassword: "x".repeat(11),
        signOutOtherSessions: true,
      }),
    ).toBe(false);
  });
  test("account requests reject unknown fields", () => {
    expect(ok(invitationCreateRequestSchema, { email: "a@example.com", role: "viewer" })).toBe(
      true,
    );
    expect(
      ok(invitationCreateRequestSchema, {
        email: "a@example.com",
        password: "x".repeat(12),
        role: "viewer",
      }),
    ).toBe(false);
    expect(ok(passwordResetRequestSchema, { email: "a@example.com", userId: "u" })).toBe(false);
    expect(
      ok(accountPasswordChangeRequestSchema, {
        currentPassword: "old",
        newPassword: "x".repeat(12),
        signOutOtherSessions: false,
        userId: "other",
      }),
    ).toBe(false);
  });
});
