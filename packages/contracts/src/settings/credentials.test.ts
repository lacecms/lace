// @ts-nocheck
// TODO(rf2): Type mutable transport fixtures and deliberately malformed metadata.
import * as v from "valibot";
import { expect, test } from "vitest";

test("import-token, slug and hash contracts are strict and point at their parameters", async () => {
  const c = {
    ...(await import("../content/entries.js")),
    ...(await import("../media/mappers.js")),
    ...(await import("../media/metadata.js")),
    ...(await import("../media/queries.js")),
    ...(await import("./credentials.js")),
  };
  expect(v.parse(c.importTokenCreateRequestSchema, { name: "Framer", expiresInDays: 7 })).toEqual({
    allowPublish: false,
    expiresInDays: 7,
    name: "Framer",
  });
  for (const [input, path] of [
    [{ name: "Import", expiresInDays: 30 }, "expiresInDays"],
    [{ name: "Import", expiresInDays: 0 }, "expiresInDays"],
    [{ name: "Import", expiresInDays: 1.5 }, "expiresInDays"],
    [{ name: "Import" }, "expiresInDays"],
    [{ name: "", expiresInDays: 1 }, "name"],
    [{ name: "Import", expiresInDays: 1, allowPublish: "yes" }, "allowPublish"],
  ]) {
    const parsed = v.safeParse(c.importTokenCreateRequestSchema, input);
    expect(parsed.success).toBe(false);
    expect(parsed.issues.map(v.getDotPath)).toContain(path);
  }
  const token = {
    capabilities: ["content:import", "content:publish"],
    createdAt: "2026-10-31T00:00:00.000Z",
    createdBy: { email: "admin@lace.test", id: "admin-1" },
    expiresAt: "2026-11-07T00:00:00.000Z",
    id: "token-1",
    name: "Framer",
    tokenPrefix: "abcdefgh",
  };
  expect(
    c.toImportTokenDto({
      ...token,
      createdAt: Date.parse(token.createdAt),
      expiresAt: Date.parse(token.expiresAt),
    }),
  ).toEqual(token);
  expect(v.parse(c.importTokenSchema, token).capabilities).toEqual([
    "content:import",
    "content:publish",
  ]);
  expect(v.safeParse(c.importTokenListSchema, { items: [token] }).success).toBe(true);
  expect(
    v.safeParse(c.importTokenListSchema, { items: [{ ...token, token: "secret" }] }).success,
  ).toBe(false);
  expect(
    v.safeParse(c.importTokenSchema, { ...token, capabilities: ["content:build:read"] }).success,
  ).toBe(false);
  expect(v.safeParse(c.importTokenCreatedSchema, { ...token, token: "secret" }).success).toBe(true);
  expect(
    v.safeParse(c.importCredentialSchema, {
      permissions: ["content:read", "content:write", "media:write"],
      token,
    }).success,
  ).toBe(true);

  const hash = "0123456789abcdef".repeat(4);
  expect(v.parse(c.contentEntryListQuerySchema, { slug: "hello-world" }).slug).toBe("hello-world");
  expect(v.parse(c.mediaListQuerySchema, { sha256: hash }).sha256).toBe(hash);
  for (const [schema, input, path] of [
    [c.contentEntryListQuerySchema, { slug: "Hello" }, "slug"],
    [c.contentEntryListQuerySchema, { slug: "a--b" }, "slug"],
    [c.contentEntryListQuerySchema, { slug: "a".repeat(101) }, "slug"],
    [c.contentEntryListQuerySchema, { slug: "a\n" }, "slug"],
    [c.mediaListQuerySchema, { sha256: hash.toUpperCase() }, "sha256"],
    [c.mediaListQuerySchema, { sha256: hash.slice(1) }, "sha256"],
    [c.mediaListQuerySchema, { sha256: `${hash}\n` }, "sha256"],
  ]) {
    const parsed = v.safeParse(schema, input);
    expect(parsed.success).toBe(false);
    expect(parsed.issues.map(v.getDotPath)).toContain(path);
  }
  const media = {
    createdAt: 1,
    createdBy: { displayName: "Ada", id: "u" },
    filename: "a.png",
    id: "m",
    mimeType: "image/png",
    size: 1,
    status: "active",
    updatedAt: 1,
    usageCount: 0,
  };
  expect(c.toMediaMetadataDto({ ...media, sha256: hash }, "/m").sha256).toBe(hash);
  expect(c.toMediaMetadataDto(media, "/m")).not.toHaveProperty("sha256");
  expect(
    v.safeParse(c.mediaMetadataSchema, { ...c.toMediaMetadataDto(media, "/m"), sha256: "x" })
      .success,
  ).toBe(false);
});
