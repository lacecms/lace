import { expect, test } from "vitest";
import { actorId } from "../shared/brands.js";
import { expectDomainError } from "../test-support/assertions.js";
import type { Actor, Role } from "./actors.js";
import { defaultRolePermissions, permissionsFor, requirePermission } from "./permissions.js";

const admin: Actor = { id: actorId("admin-1"), role: "admin" };
const editor: Actor = { id: actorId("editor-1"), role: "editor" };
const viewer: Actor = { id: actorId("viewer-1"), role: "viewer" };

test("uses the complete default role-to-permission matrix", () => {
  expect(defaultRolePermissions.admin).toEqual([
    "content:read",
    "content:write",
    "content:publish",
    "media:write",
    "users:manage",
    "settings:manage",
  ]);
  expect(defaultRolePermissions.editor).toEqual(["content:read", "content:write", "media:write"]);
  expect(defaultRolePermissions.viewer).toEqual(["content:read"]);
  expect(Object.isFrozen(defaultRolePermissions)).toBe(true);

  expect(() => requirePermission(editor, "content:write")).not.toThrow();
  expect(() => requirePermission(viewer, "content:read")).not.toThrow();
  expectDomainError(() => requirePermission(editor, "content:publish"), "AUTHORIZATION_DENIED");
  expectDomainError(() => requirePermission(viewer, "media:write"), "AUTHORIZATION_DENIED");
  expect(() => requirePermission(admin, "settings:manage")).not.toThrow();
});

test("derives each role's permissions from the same frozen policy", () => {
  const roles: readonly Role[] = ["admin", "editor", "viewer"];
  for (const role of roles) {
    expect(permissionsFor(role)).toBe(defaultRolePermissions[role]);
    expect(Object.isFrozen(permissionsFor(role))).toBe(true);
  }
  expect(permissionsFor("editor")).toEqual(["content:read", "content:write", "media:write"]);
  expect(permissionsFor("viewer")).toEqual(["content:read"]);
});
