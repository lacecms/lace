import { screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { renderInRouter, stubClient } from "../../../app/testing/index.js";
import { AdminClientError } from "../../../shared/api/index.js";
import { ProfileForm } from "./index.js";

test("saves a trimmed display name and re-reads the session", async () => {
  const user = userEvent.setup();
  const invalidate = vi.fn();
  const updateProfile = vi.fn(async () => ({
    permissions: ["content:read" as const],
    user: {
      displayName: "Ada Lovelace",
      email: "viewer@lace.test",
      id: "viewer-1",
      role: "viewer" as const,
    },
  }));
  renderInRouter(<ProfileForm />, {
    client: stubClient({ updateProfile }),
    session: { displayName: "Ada", id: "viewer-1", role: "viewer" },
    sessionSource: { get: async () => null, invalidate },
  });
  const name = await screen.findByLabelText("Display name");
  expect(name).toHaveValue("Ada");
  expect(screen.getByLabelText("Email")).toHaveAttribute("readonly");
  const save = screen.getByRole("button", { name: "Save name" });
  expect(save).toBeDisabled();
  await user.clear(name);
  await user.type(name, "  Ada Lovelace ");
  await user.click(save);
  await waitFor(() => expect(updateProfile).toHaveBeenCalledWith({ displayName: "Ada Lovelace" }));
  expect(await screen.findByText("Display name updated.")).toBeInTheDocument();
  expect(invalidate).toHaveBeenCalled();
});

test("a rejected name stays in the form with the error", async () => {
  const user = userEvent.setup();
  renderInRouter(<ProfileForm />, {
    client: stubClient({
      updateProfile: async () => {
        throw new AdminClientError({
          message: "Enter a name of 1 to 120 characters.",
          status: 400,
        });
      },
    }),
    session: { displayName: "Ada", id: "viewer-1", role: "viewer" },
  });
  const name = await screen.findByLabelText("Display name");
  await user.type(name, " Byron");
  await user.click(screen.getByRole("button", { name: "Save name" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Enter a name of 1 to 120 characters.",
  );
  expect(name).toHaveValue("Ada Byron");
});
