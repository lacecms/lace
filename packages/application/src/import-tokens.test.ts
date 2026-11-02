import { expect, test } from "vitest";
import { importTokenCapabilities, importTokenExpiry } from "./index.js";
import { actorId, DomainError, type Actor } from "@lacecms/domain";
import { unixMilliseconds } from "@lacecms/domain";

test("import-token capabilities require settings management and current publish permission", () => {
  const admin: Actor = { id: actorId("admin"), role: "admin" };
  expect(importTokenCapabilities(admin, false)).toEqual(["content:import"]);
  expect(importTokenCapabilities(admin, true)).toEqual(["content:import", "content:publish"]);
  const attenuated: Actor = {
    ...admin,
    authority: { operations: [], permissions: ["settings:manage", "content:read"] },
  };
  expect(() => importTokenCapabilities(attenuated, true)).toThrow(DomainError);
  expect(importTokenCapabilities(attenuated, false)).toEqual(["content:import"]);
  expect(() => importTokenCapabilities({ id: actorId("editor"), role: "editor" }, false)).toThrow(
    DomainError,
  );
});

test("import-token lifetimes are 1 to 7 whole days", () => {
  const now = unixMilliseconds(1_000);
  expect(importTokenExpiry(now, 1)).toBe(1_000 + 86_400_000);
  expect(importTokenExpiry(now, 7)).toBe(1_000 + 7 * 86_400_000);
  for (const days of [0, 8, 1.5, Number.NaN]) expect(() => importTokenExpiry(now, days)).toThrow();
});
