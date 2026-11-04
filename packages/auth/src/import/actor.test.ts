import { canContentOperation } from "@lacecms/application";
import type { ImportTokenCapabilities, ImportTokenMetadata } from "@lacecms/application";
import { hasPermission, unixMilliseconds } from "@lacecms/domain";
import type { Permission } from "@lacecms/domain";
import { expect, test } from "vitest";
import { present } from "../test-support/assertions.js";
import { createImportActorResolver } from "./actor.js";

function importToken(id: string, capabilities: ImportTokenCapabilities): ImportTokenMetadata {
  return {
    capabilities,
    createdAt: unixMilliseconds(1),
    createdBy: { email: "admin@cms.test", id: "admin-1" },
    expiresAt: unixMilliseconds(Date.now() + 60000),
    id,
    name: id,
    tokenPrefix: id.slice(0, 8),
  };
}

test("import tokens resolve the creator's current role under a write-only ceiling", async () => {
  const tokens = new Map<
    string,
    { readonly role: string; readonly capabilities: ImportTokenCapabilities }
  >([
    ["import-token", { role: "admin", capabilities: ["content:import"] }],
    ["publish-token", { role: "admin", capabilities: ["content:import", "content:publish"] }],
    ["demoted-token", { role: "editor", capabilities: ["content:import", "content:publish"] }],
    ["broken-role", { role: "owner", capabilities: ["content:import"] }],
  ]);
  const presented: [number, string][] = [];
  const resolver = createImportActorResolver({
    now: () => 42,
    origin: new URL("https://cms.test"),
    production: true,
    security: {
      async resolveImportToken({ now, token }) {
        presented.push([now, token]);
        const value = tokens.get(token);
        return value === undefined
          ? null
          : {
              creator: { id: "admin-1", role: value.role },
              token: importToken(token, value.capabilities),
            };
      },
    },
  });
  const request = (authorization?: string, query = "") =>
    new Request(`https://cms.test/api/v1/admin/media${query}`, {
      headers: authorization === undefined ? {} : { authorization, cookie: "session=valid" },
    });

  const plain = present(await resolver.resolve(request("Bearer import-token")));
  expect(plain.actor).toMatchObject({ id: "admin-1", role: "admin" });
  expect(plain.token.id).toBe("import-token");
  const granted: readonly Permission[] = ["content:read", "content:write", "media:write"];
  for (const permission of granted) expect(hasPermission(plain.actor, permission)).toBe(true);
  const withheld: readonly Permission[] = ["content:publish", "users:manage", "settings:manage"];
  for (const permission of withheld) expect(hasPermission(plain.actor, permission)).toBe(false);
  for (const operation of ["discoverModels", "list", "load", "create", "save"])
    expect(canContentOperation(plain.actor, operation)).toBe(true);
  for (const operation of ["publish", "unpublish", "delete", "revertDraft", "duplicate"])
    expect(canContentOperation(plain.actor, operation)).toBe(false);

  const publisher = present(await resolver.resolve(request("Bearer publish-token")));
  expect(hasPermission(publisher.actor, "content:publish")).toBe(true);
  expect(canContentOperation(publisher.actor, "publish")).toBe(true);
  expect(canContentOperation(publisher.actor, "unpublish")).toBe(false);

  // A demoted creator keeps writing but loses publication through the role.
  const demoted = present(await resolver.resolve(request("Bearer demoted-token")));
  expect(hasPermission(demoted.actor, "content:write")).toBe(true);
  expect(canContentOperation(demoted.actor, "publish")).toBe(false);

  presented.length = 0;
  for (const value of [
    undefined,
    "Basic import-token",
    "Bearer",
    "Bearer  import-token",
    "Bearer import-token extra",
    `Bearer ${"a".repeat(4097)}`,
    "Bearer unknown",
    "Bearer broken-role",
  ])
    expect(await resolver.resolve(request(value))).toBeNull();
  expect(
    await resolver.resolve(request("Bearer import-token", "?access_token=import-token")),
  ).toBeNull();
  expect(presented).toEqual([
    [42, "unknown"],
    [42, "broken-role"],
  ]);

  // Unsafe methods refuse an explicit foreign Origin; reads and origin-less calls proceed.
  const unsafe = (origin?: string) =>
    new Request("https://cms.test/api/v1/admin/entries/e/draft", {
      method: "PUT",
      headers: { authorization: "Bearer import-token", ...(origin ? { origin } : {}) },
    });
  expect(await resolver.resolve(unsafe("https://evil.example"))).toBeNull();
  expect(await resolver.resolve(unsafe("null"))).toBeNull();
  expect(await resolver.resolve(unsafe("https://cms.test"))).not.toBeNull();
  expect(await resolver.resolve(unsafe())).not.toBeNull();
  const crossSiteRead = new Request("https://cms.test/api/v1/admin/media", {
    headers: { authorization: "Bearer import-token", origin: "https://evil.example" },
  });
  expect(await resolver.resolve(crossSiteRead)).not.toBeNull();
});
