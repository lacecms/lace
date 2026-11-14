import { screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { renderRoute, sessionFor, stubClient as client } from "../../../app/testing/index.js";
import { AdminClientError } from "../../../shared/api/index.js";

test("a denied save keeps the editor and does not reread the session", async () => {
  const source = {
    get: vi.fn(async () => sessionFor({ id: "editor-1", role: "editor" })),
    invalidate: vi.fn(),
  };
  renderRoute(
    "/content/posts/entry-1",
    source,
    client({
      saveDraft: async () => {
        throw new AdminClientError({
          code: "AUTHORIZATION_DENIED",
          message: "Permission denied",
          status: 403,
        });
      },
    }),
  );
  const user = userEvent.setup();
  await screen.findByRole("heading", { name: "Edit posts" });
  const reads = source.get.mock.calls.length;
  await user.type(screen.getByLabelText("Title"), " changed");
  await user.click(screen.getByRole("button", { name: "Save draft" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Permission denied");
  expect(screen.getByRole("heading", { name: "Edit posts" })).toBeInTheDocument();
  expect(source.get).toHaveBeenCalledTimes(reads);
  expect(source.invalidate).not.toHaveBeenCalled();
});
