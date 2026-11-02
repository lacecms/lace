import { expect, test } from "vitest";
import {
  ConfigurationError,
  normalizePagePath,
  normalizeCollectionRoute,
  resolveCollectionRoute,
} from "@lacecms/config";
import {
  DomainError,
  normalizePagePublicPath,
  normalizeCollectionPublicRoute,
  resolveCollectionPublicPath,
} from "@lacecms/domain";

function rejected(action: () => unknown): Error {
  try {
    action();
  } catch (error) {
    expect(error).toBeInstanceOf(Error);
    return error as Error;
  }
  throw new Error("Expected route rejection");
}

function parity(config: () => unknown, domain: () => unknown) {
  const a = rejected(config);
  const b = rejected(domain);
  expect(a).toBeInstanceOf(ConfigurationError);
  expect(b).toBeInstanceOf(DomainError);
  expect((b as DomainError).code).toBe("CONTENT_INVALID_STATE");
  expect(b.message).toBe(a.message);
}

test("configuration and domain reject the same noncanonical paths and routes", () => {
  for (const input of ["/blog/", "/a//b", "/a/../b", "/a?b", "blog", "/a b", 42]) {
    const value = input as string;
    parity(
      () => normalizePagePath(value),
      () => normalizePagePublicPath(value),
    );
    parity(
      () => normalizeCollectionRoute(value),
      () => normalizeCollectionPublicRoute(value),
    );
  }
  parity(
    () => normalizePagePath("/a/:id"),
    () => normalizePagePublicPath("/a/:id"),
  );
  parity(
    () => normalizeCollectionRoute("/blog/:slug/:id"),
    () => normalizeCollectionPublicRoute("/blog/:slug/:id"),
  );
});

test("configuration and domain resolve paths and reject malformed slugs identically", () => {
  for (const input of ["Release_Notes", "release--notes", "-release", "a".repeat(101), 42]) {
    const slug = input as string;
    parity(
      () => resolveCollectionRoute("/blog/:slug", slug),
      () => resolveCollectionPublicPath("/blog/:slug", slug),
    );
  }
  expect(resolveCollectionRoute("/blog/:slug", "release-notes")).toBe("/blog/release-notes");
  expect(resolveCollectionPublicPath("/blog/:slug", "release-notes")).toBe("/blog/release-notes");
});
