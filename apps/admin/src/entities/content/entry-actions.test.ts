import { expect, test } from "vitest";
import { entryActions, hasEntryActions } from "./entry-actions.js";

const roles = {
  admin: { canPublish: true, canWrite: true },
  editor: { canPublish: false, canWrite: true },
  viewer: { canPublish: false, canWrite: false },
} as const;

test.each([
  // role, kind, published, saved, unsaved → duplicate, revert, unpublish, delete
  ["admin", "collection", true, true, false, [true, true, true, true]],
  ["admin", "collection", true, false, false, [true, false, true, true]],
  ["admin", "collection", true, false, true, [true, true, true, true]],
  ["admin", "collection", false, false, true, [true, false, false, true]],
  ["admin", "page", true, false, false, [false, false, true, false]],
  ["admin", "page", true, true, false, [false, true, true, false]],
  ["admin", "page", false, false, false, [false, false, false, false]],
  ["editor", "collection", true, false, false, [true, false, false, false]],
  ["editor", "collection", true, true, false, [true, true, false, false]],
  ["editor", "collection", false, false, false, [true, false, false, true]],
  ["editor", "page", true, true, true, [false, true, false, false]],
  ["viewer", "collection", true, true, true, [false, false, false, false]],
  ["viewer", "page", true, true, false, [false, false, false, false]],
] as const)(
  "%s on a %s (published %s, saved changes %s, unsaved changes %s)",
  (role, kind, published, savedChanges, unsavedChanges, expected) => {
    const actions = entryActions({ ...roles[role], kind, published, savedChanges, unsavedChanges });
    expect([actions.duplicate, actions.revert, actions.unpublish, actions.delete]).toEqual(
      expected,
    );
    expect(hasEntryActions(actions)).toBe(expected.some(Boolean));
  },
);
