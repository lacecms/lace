import { expect, test } from "vitest";
import { AdminClientError } from "../../shared/api/index.js";
import { mediaDeletionDescription } from "./useMediaDeletion.js";

test("explains referenced-media refusals and passes other failures through", () => {
  expect(
    mediaDeletionDescription(
      new AdminClientError({ code: "MEDIA_IN_USE", message: "In use.", status: 409 }),
    ),
  ).toContain("content still uses this media");
  expect(
    mediaDeletionDescription(
      new AdminClientError({ code: "CONTENT_INVALID_STATE", message: "Invalid state." }),
    ),
  ).toContain("no longer active");
  expect(mediaDeletionDescription(new Error("Offline."))).toBe("Offline.");
});

test("a refused detaching deletion says drafts may already have changed", () => {
  const inUse = new AdminClientError({ code: "MEDIA_IN_USE", message: "In use.", status: 409 });
  expect(mediaDeletionDescription(inUse, { detached: true })).toMatch(
    /a published version, or an entry that started using it meanwhile.*Some drafts may already have changed\.$/u,
  );
  const conflict = new AdminClientError({
    code: "CONTENT_REVISION_CONFLICT",
    message: "Conflict.",
    status: 409,
  });
  expect(mediaDeletionDescription(conflict, { detached: true })).toMatch(
    /Some drafts may already have changed\.$/u,
  );
  expect(mediaDeletionDescription(inUse)).not.toContain("Some drafts");
});
