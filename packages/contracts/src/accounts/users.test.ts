// @ts-nocheck
// TODO(rf2): Type mutable transport fixtures and deliberately malformed metadata.
import * as v from "valibot";
import { expect, test } from "vitest";
import { adminSessionSchema, setupStateSchema } from "../index.js";

test("session summaries carry a closed, unique permission list", () => {
  const session = {
    permissions: ["content:read", "content:write", "media:write"],
    user: { displayName: "Ed", email: "ed@example.com", id: "user-1", role: "editor" },
  };
  expect(v.parse(adminSessionSchema, session)).toEqual(session);
  const parse = (value) => v.safeParse(adminSessionSchema, value).success;
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
