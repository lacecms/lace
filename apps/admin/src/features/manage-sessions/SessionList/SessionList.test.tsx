import type { AccountSessionDto } from "@lacecms/contracts";
import { screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { renderInRouter, stubClient } from "../../../app/testing/index.js";
import { AdminClientError } from "../../../shared/api/index.js";
import { SessionList } from "./index.js";

const now = Date.parse("2026-10-10T12:00:00.000Z");
const current: AccountSessionDto = {
  browser: "Firefox",
  createdAt: "2026-10-09T12:00:00.000Z",
  current: true,
  id: "session-1",
  lastActiveAt: "2026-10-10T11:59:00.000Z",
  os: "Linux",
};
const laptop: AccountSessionDto = {
  browser: "Chrome",
  createdAt: "2026-10-01T12:00:00.000Z",
  current: false,
  id: "session-2",
  lastActiveAt: "2026-10-10T09:00:00.000Z",
  os: "macOS",
};
const phone: AccountSessionDto = {
  browser: "Safari",
  createdAt: "2026-10-05T12:00:00.000Z",
  current: false,
  id: "session-3",
  lastActiveAt: "2026-10-08T12:00:00.000Z",
  os: "iOS",
};

function sessionsClient(initial: AccountSessionDto[]) {
  let items = initial;
  const listSessions = vi.fn(async () => ({ items }));
  const deleteSession = vi.fn(async (id: string) => {
    items = items.filter((item) => item.id !== id);
  });
  const revokeOtherSessions = vi.fn(async () => {
    const revoked = items.filter((item) => !item.current).length;
    items = items.filter((item) => item.current);
    return { revoked };
  });
  return { deleteSession, listSessions, revokeOtherSessions };
}

test("lists sessions with browser, system, relative times, and this device first", async () => {
  renderInRouter(<SessionList now={now} />, {
    client: stubClient(sessionsClient([phone, laptop, current])),
  });
  const list = await screen.findByRole("list", { name: "Sessions" });
  const items = within(list).getAllByRole("listitem");
  expect(items.map((item) => item.textContent)).toEqual([
    expect.stringContaining("Firefox on Linux"),
    expect.stringContaining("Chrome on macOS"),
    expect.stringContaining("Safari on iOS"),
  ]);
  expect(items[0]).toHaveTextContent("This device");
  expect(within(items[0]!).queryByRole("button")).not.toBeInTheDocument();
  expect(items[1]).toHaveTextContent("Signed in last week · Last active 3 hours ago");
  expect(items[1]).not.toHaveTextContent("This device");
  expect(list).not.toHaveTextContent("session-2");
});

test("signs out one other session after confirmation", async () => {
  const user = userEvent.setup();
  const client = sessionsClient([current, laptop, phone]);
  renderInRouter(<SessionList now={now} />, { client: stubClient(client) });
  await user.click(
    await screen.findByRole("button", {
      name: "Sign out Chrome on macOS, last active 3 hours ago",
    }),
  );
  const dialog = await screen.findByRole("dialog", { name: "Sign out this session?" });
  await user.click(within(dialog).getByRole("button", { name: "Sign out session" }));
  expect(await screen.findByText("Signed out Chrome on macOS.")).toBeInTheDocument();
  expect(client.deleteSession).toHaveBeenCalledWith("session-2");
  await waitFor(() =>
    expect(screen.getByRole("list", { name: "Sessions" })).not.toHaveTextContent("Chrome"),
  );
});

test("signs out all other sessions after confirmation", async () => {
  const user = userEvent.setup();
  const client = sessionsClient([current, laptop, phone]);
  renderInRouter(<SessionList now={now} />, { client: stubClient(client) });
  await user.click(await screen.findByRole("button", { name: "Sign out all other sessions" }));
  const dialog = await screen.findByRole("dialog", { name: "Sign out all other sessions?" });
  await user.click(within(dialog).getByRole("button", { name: "Sign out other sessions" }));
  expect(await screen.findByText("Signed out 2 other sessions.")).toBeInTheDocument();
  expect(await screen.findByText("You are not signed in anywhere else.")).toBeInTheDocument();
  expect(
    within(screen.getByRole("list", { name: "Sessions" })).getAllByRole("listitem"),
  ).toHaveLength(1);
});

test("cancelling sends nothing and a failure stays in the dialog", async () => {
  const user = userEvent.setup();
  const client = sessionsClient([current, laptop]);
  client.deleteSession.mockRejectedValueOnce(
    new AdminClientError({ message: "The requested resource was not found.", status: 404 }),
  );
  renderInRouter(<SessionList now={now} />, { client: stubClient(client) });
  const trigger = await screen.findByRole("button", {
    name: "Sign out Chrome on macOS, last active 3 hours ago",
  });
  await user.click(trigger);
  await user.click(screen.getByRole("button", { name: "Cancel" }));
  await waitFor(() => expect(trigger).toHaveFocus());
  expect(client.deleteSession).not.toHaveBeenCalled();
  await user.click(trigger);
  const dialog = await screen.findByRole("dialog", { name: "Sign out this session?" });
  await user.click(within(dialog).getByRole("button", { name: "Sign out session" }));
  expect(await within(dialog).findByRole("alert")).toHaveTextContent("was not found");
});

test("a failed session list offers Try again", async () => {
  const user = userEvent.setup();
  let fail = true;
  renderInRouter(<SessionList now={now} />, {
    client: stubClient({
      listSessions: async () => {
        if (fail) throw new AdminClientError({ message: "Sessions unavailable.", status: 503 });
        return { items: [current] };
      },
    }),
  });
  expect(await screen.findByRole("alert")).toHaveTextContent("Sessions unavailable.");
  fail = false;
  await user.click(screen.getByRole("button", { name: "Try again" }));
  expect(await screen.findByText("This device")).toBeInTheDocument();
});
