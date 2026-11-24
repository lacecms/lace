import * as v from "valibot";
import { expect, test } from "vitest";
import {
  adminSessionSchema,
  setupStateSchema,
  userCreateRequestSchema,
  userCreateResultSchema,
} from "./users.js";

test("direct creation validates a trimmed email and a role", () => {
  const input = { email: " New@example.com ", role: "editor" };
  expect(v.parse(userCreateRequestSchema, input)).toEqual({ ...input, email: "New@example.com" });
  expect(v.safeParse(userCreateRequestSchema, { role: "editor" }).success).toBe(false);
  expect(v.safeParse(userCreateRequestSchema, { ...input, role: "owner" }).success).toBe(false);
  expect(v.safeParse(userCreateRequestSchema, { ...input, password: "unexpected" }).success).toBe(
    false,
  );
});

test("direct creation returns an enabled user and a reset link only on delivery failure", () => {
  const origin = "https://lace.test";
  const fragment = `#token=${"T".repeat(43)}`;
  const link = `${origin}/admin/reset-password${fragment}`;
  const user = { disabled: false, email: "new@lace.test", id: "new-user", role: "editor" };
  const failed = { delivery: { reason: "not_configured", status: "failed" }, user };
  const sent = { delivery: { status: "sent" }, user };
  const valid = (value: unknown) => v.safeParse(userCreateResultSchema, value).success;
  expect(valid({ ...failed, link })).toBe(true);
  expect(valid(sent)).toBe(true);
  expect(valid(failed)).toBe(false);
  expect(valid({ ...sent, link })).toBe(false);
  expect(valid({ ...failed, link: `${origin}/admin/accept-invite${fragment}` })).toBe(false);
  expect(valid({ ...sent, user: { ...user, disabled: true } })).toBe(false);
});

test("session summaries carry a closed, unique permission list", () => {
  const session = {
    permissions: ["content:read", "content:write", "media:write"],
    user: { displayName: "Ed", email: "ed@example.com", id: "user-1", role: "editor" },
  };
  expect(v.parse(adminSessionSchema, session)).toEqual(session);
  const parse = (value: unknown) => v.safeParse(adminSessionSchema, value).success;
  expect(parse({ ...session, permissions: ["content:read", "content:delete"] })).toBe(false);
  expect(parse({ ...session, permissions: ["content:read", "content:read"] })).toBe(false);
  expect(parse({ ...session, token: "secret" })).toBe(false);
  expect(parse({ ...session, user: { ...session.user, role: "owner" } })).toBe(false);
  expect(parse({ ...session, user: { ...session.user, sessionToken: "secret" } })).toBe(false);
});

test("setup state is a strict boolean-only contract", () => {
  expect(v.parse(setupStateSchema, { setupComplete: false })).toEqual({ setupComplete: false });
  expect(v.safeParse(setupStateSchema, { setupComplete: "false" }).success).toBe(false);
  expect(v.safeParse(setupStateSchema, { setupComplete: true, userId: "private" }).success).toBe(
    false,
  );
});
