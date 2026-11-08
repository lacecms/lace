import { describe, expect, test } from "vitest";
import { actorId } from "@lacecms/domain";
import { admin, delegatedActor, editor, testActor, viewer } from "./actors.js";

describe("actor fixtures", () => {
  test("role actors are frozen and carry their role as id", () => {
    for (const [actor, role] of [
      [admin, "admin"],
      [editor, "editor"],
      [viewer, "viewer"],
    ] as const) {
      expect(actor).toEqual({ id: actorId(role), role });
      expect(Object.isFrozen(actor)).toBe(true);
    }
  });

  test("testActor accepts an explicit id", () => {
    expect(testActor("editor", "editor-2")).toEqual({ id: actorId("editor-2"), role: "editor" });
  });

  test("delegatedActor narrows authority without widening it", () => {
    const delegated = delegatedActor(editor, {
      permissions: ["content:read"],
      operations: ["read"],
    });
    expect(delegated.authority).toEqual({ permissions: ["content:read"], operations: ["read"] });
    expect(
      delegatedActor(delegated, { permissions: ["content:read", "content:write"], operations: [] })
        .authority?.permissions,
    ).toEqual(["content:read"]);
  });
});
