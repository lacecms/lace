import { expect, test } from "vitest";
import { contentEntryId, contentSnapshotId, unixMilliseconds } from "../shared/brands.js";
import { expectDomainError } from "../test-support/assertions.js";
import { assertEntryCreationAllowed } from "./entries.js";
import {
  assertPublicPathAvailable,
  isSingletonKind,
  normalizeCollectionPublicRoute,
  resolveCollectionPublicPath,
} from "./routes.js";
import type { PublishedRoute } from "./routes.js";

const entryId = contentEntryId("entry-1");

test("enforces page cardinality and resolves public collection paths safely", () => {
  expect(() => assertEntryCreationAllowed("page", 0)).not.toThrow();
  expect(() => assertEntryCreationAllowed("collection", 99)).not.toThrow();
  expectDomainError(
    () => assertEntryCreationAllowed("page", 1),
    "CONTENT_MODEL_CARDINALITY_CONFLICT",
  );
  expect(resolveCollectionPublicPath("/blog/:slug", "release-notes")).toBe("/blog/release-notes");
  expect(() => assertEntryCreationAllowed("global", 0)).not.toThrow();
  expectDomainError(
    () => assertEntryCreationAllowed("global", 1),
    "CONTENT_MODEL_CARDINALITY_CONFLICT",
  );
  expect([
    isSingletonKind("page"),
    isSingletonKind("global"),
    isSingletonKind("collection"),
  ]).toEqual([true, true, false]);

  for (const slug of ["Release", "release/notes", "release--notes", "", "release?x=1", "."]) {
    expectDomainError(
      () => resolveCollectionPublicPath("/blog/:slug", slug),
      "CONTENT_INVALID_STATE",
    );
  }
});

test("allows an entry to retain its route while rejecting a different route owner", () => {
  const existingRoute: PublishedRoute = {
    entryId,
    path: "/blog/release-notes",
    snapshotId: contentSnapshotId("published-1"),
    updatedAt: unixMilliseconds(2),
  };
  expect(() =>
    assertPublicPathAvailable("/blog/release-notes", entryId, existingRoute),
  ).not.toThrow();
  expectDomainError(
    () =>
      assertPublicPathAvailable("/blog/release-notes", contentEntryId("entry-2"), existingRoute),
    "CONTENT_ROUTE_CONFLICT",
  );
});

test("collection route failures use the shared parameter wording", () => {
  expect(() => normalizeCollectionPublicRoute("/blog/:slug/:id")).toThrow(
    "route must contain exactly one :slug segment and no other parameters.",
  );
});
