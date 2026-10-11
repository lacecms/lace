import { screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { draftEntry, renderInRouter, stubClient } from "../../app/testing/index.js";
import { adminQueryKeys, AdminClientError } from "../../shared/api/index.js";
import { useDuplicateEntry } from "./index.js";

function DuplicateButton() {
  const duplicate = useDuplicateEntry("posts");
  return (
    <button
      onClick={() => duplicate.mutate({ entryId: "entry-1", expectedRevision: 2 })}
      type="button"
    >
      Duplicate
    </button>
  );
}

const copy = {
  ...draftEntry,
  draft: {
    ...draftEntry.draft,
    entryId: "copy-1",
    id: "copy-snapshot",
    title: "First post (copy)",
  },
  id: "copy-1",
};

test("duplicates with the displayed revision, seeds the copy and opens it", async () => {
  const user = userEvent.setup();
  const duplicateEntry = vi.fn(async () => copy);
  const { queryClient, router } = renderInRouter(<DuplicateButton />, {
    client: stubClient({ duplicateEntry }),
  });
  await user.click(await screen.findByRole("button", { name: "Duplicate" }));
  await waitFor(() => expect(router.state.location.pathname).toBe("/content/posts/copy-1"));
  expect(duplicateEntry).toHaveBeenCalledWith("entry-1", 2);
  expect(queryClient.getQueryData(adminQueryKeys.entry("copy-1"))).toEqual(copy);
  expect(await screen.findByText("Created “First post (copy)”.")).toBeInTheDocument();
});

test("a failed duplicate is announced without navigation", async () => {
  const user = userEvent.setup();
  const duplicateEntry = vi.fn(async () => {
    throw new AdminClientError({ message: "The draft changed.", status: 409 });
  });
  const { router } = renderInRouter(<DuplicateButton />, {
    client: stubClient({ duplicateEntry }),
  });
  await user.click(await screen.findByRole("button", { name: "Duplicate" }));
  expect(
    await screen.findByText("Could not duplicate the entry. The draft changed."),
  ).toBeInTheDocument();
  expect(router.state.location.pathname).toBe("/");
});
