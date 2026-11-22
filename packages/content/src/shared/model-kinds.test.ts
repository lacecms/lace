import { expect, test } from "vitest";
import {
  CONTENT_MODEL_KINDS,
  isContentModelKind,
  modelKindDescriptor,
  modelKindDescriptors,
  resolveModelKind,
} from "../index.js";

test.each([
  [{ kind: "page" }, "one", "fixed", "pages", "entries", "editor", "editable", true],
  [
    { kind: "collection", route: "/posts/:slug" },
    "many",
    "slug",
    "collections",
    "entries",
    "list",
    "editable",
    true,
  ],
  [{ kind: "collection" }, "many", "none", "records", "records", "list", "editable", true],
  [{ kind: "global" }, "one", "none", "globals", "globals", "editor", "system", false],
] as const)(
  "resolves the policy for %o",
  (
    model,
    cardinality,
    routing,
    publicFamily,
    exportSection,
    navigation,
    title,
    referenceTarget,
  ) => {
    expect(resolveModelKind(model)).toEqual({
      cardinality,
      routing,
      publicFamily,
      exportSection,
      admin: { navigation, title },
      referenceTarget,
    });
  },
);

test("registered kinds are own keys and the descriptor table is immutable", () => {
  expect(CONTENT_MODEL_KINDS).toEqual(["page", "collection", "global"]);
  for (const kind of CONTENT_MODEL_KINDS) {
    expect(isContentModelKind(kind)).toBe(true);
    expect(Object.isFrozen(modelKindDescriptor(kind).admin)).toBe(true);
  }
  expect(isContentModelKind("article")).toBe(false);
  expect(isContentModelKind("constructor")).toBe(false);
  expect(Object.isFrozen(modelKindDescriptors)).toBe(true);
  expect(Object.isFrozen(CONTENT_MODEL_KINDS)).toBe(true);
});
