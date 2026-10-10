import { screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { renderInRouter, stubClient } from "../../../app/testing/index.js";
import { EndSessionDialog } from "./index.js";

const session = {
  browser: "Edge" as const,
  createdAt: "2026-10-01T12:00:00.000Z",
  current: false,
  id: "session-2",
  lastActiveAt: "2026-10-10T09:00:00.000Z",
  os: "Windows" as const,
};

test("names the session in the confirmation and ends only it", async () => {
  const user = userEvent.setup();
  const deleteSession = vi.fn(async () => undefined);
  renderInRouter(<EndSessionDialog lastActive="yesterday" session={session} />, {
    client: stubClient({ deleteSession }),
  });
  await user.click(
    await screen.findByRole("button", { name: "Sign out Edge on Windows, last active yesterday" }),
  );
  const dialog = await screen.findByRole("dialog", { name: "Sign out this session?" });
  expect(dialog).toHaveTextContent("Edge on Windows, last active yesterday, will be signed out");
  await user.click(within(dialog).getByRole("button", { name: "Sign out session" }));
  expect(await screen.findByText("Signed out Edge on Windows.")).toBeInTheDocument();
  expect(deleteSession).toHaveBeenCalledWith("session-2");
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
});
