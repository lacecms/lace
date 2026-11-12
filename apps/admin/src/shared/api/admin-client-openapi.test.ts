import { readFileSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  checkFacade,
  checkOperation,
  clientSourceFiles,
  extractOperations,
} from "./admin-client-openapi-guard.js";

import { createAdminClient } from "./admin-client.js";

const root = resolve(import.meta.dirname, "../../../../..");
const doc = JSON.parse(readFileSync(resolve(root, "apps/api/openapi/api-v1.json"), "utf8"));
const files = clientSourceFiles(root);
const operations = extractOperations(files);

describe("admin client OpenAPI drift", () => {
  it("checks every client operation and query", () => {
    checkFacade(resolve(root, "apps/admin/src/shared/api/admin-client.ts"), files);
    expect(new Set(operations.map((operation) => operation.clientMethod))).toEqual(
      new Set(Object.keys(createAdminClient())),
    );
    const errors: string[] = [];
    for (const operation of operations) {
      try {
        checkOperation(doc, operation);
      } catch (error) {
        errors.push(String(error));
      }
    }
    expect(errors).toEqual([]);
  });
  it("rejects missing paths, methods and query names with locations", () => {
    const base = { path: "/api/v1/admin/media", method: "GET", query: [], location: "fixture:1:1" };
    expect(() => checkOperation(doc, { ...base, path: "/api/v1/absent" })).toThrow(
      /fixture:1:1.*OpenAPI path/,
    );
    expect(() => checkOperation(doc, { ...base, method: "PUT" })).toThrow(/fixture:1:1.*no PUT/);
    expect(() => checkOperation(doc, { ...base, query: ["wrong"] })).toThrow(
      /fixture:1:1.*query wrong/,
    );
  });
  it("covers dynamic query branches, object keys, and upload", () => {
    const names = (method: string) =>
      new Set(
        operations.filter((item) => item.clientMethod === method).flatMap((item) => item.query),
      );
    expect(names("listEntries")).toEqual(
      new Set(["after", "q", "status", "sort", "limit", "filters"]),
    );
    expect(names("listMedia")).toEqual(new Set(["after", "q", "tag", "type", "sort", "limit"]));
    expect(names("listLinkTargets")).toEqual(new Set(["search", "status", "after", "limit"]));
    expect(names("linkImpact")).toEqual(
      new Set(["action", "after", "sourceEntryId", "snapshotId", "locationsAfter", "limit"]),
    );
    expect(operations).toContainEqual(
      expect.objectContaining({
        clientMethod: "uploadMedia",
        path: "/api/v1/admin/media",
        method: "POST",
      }),
    );
  });
  it("fails closed for unsupported source and computed method declarations", () => {
    const folder = mkdtempSync(resolve(tmpdir(), "lace-admin-openapi-"));
    try {
      const file = resolve(folder, "fixture.ts");
      writeFileSync(
        file,
        `export function client(fetcher: unknown) { return { method: async () => request(fetcher, makePath()) }; }`,
      );
      expect(() => extractOperations([file])).toThrow(
        /fixture\.ts:\d+:\d+: unsupported route expression/,
      );
      writeFileSync(
        file,
        `export function client() { return { method() { return fetch("/api/v1/unknown"); } }; }`,
      );
      expect(() => extractOperations([file])).toThrow(/unsupported client method declaration/);
      writeFileSync(
        file,
        `export function client(fetcher: unknown) { return { method: async (key: string) => { const search = new URLSearchParams(); search.set(key, "x"); return request(fetcher, \`/api/v1/admin/media?\${search}\`); } }; }`,
      );
      expect(() => extractOperations([file])).toThrow(/query name must be a literal/);
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  });
  it("keeps Better Auth separately bounded", () => {
    const base = {
      path: "/api/auth/oauth2/authorize",
      method: "GET",
      query: ["transaction"],
      location: "fixture:1:1",
    };
    expect(() => checkOperation(doc, base)).not.toThrow();
    expect(() => checkOperation(doc, { ...base, query: ["unknown"] })).toThrow(
      /unlisted auth query/,
    );
    expect(() => checkOperation(doc, { ...base, path: "/api/auth/new" })).toThrow(
      /unlisted auth operation/,
    );
    expect(() => checkOperation(doc, { ...base, path: "/other" })).toThrow(/unknown namespace/);
  });
});
