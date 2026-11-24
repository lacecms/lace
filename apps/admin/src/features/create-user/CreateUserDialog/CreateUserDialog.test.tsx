import type { UserCreateResultDto } from "@lacecms/contracts";
import { screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { renderInRouter, stubClient } from "../../../app/testing/index.js";
import { AdminClientError, adminQueryKeys } from "../../../shared/api/index.js";
import { CreateUserDialog } from "./index.js";

const account = {
  disabled: false,
  email: "new@lace.test",
  id: "new-user",
  role: "editor",
} as const;
const link = `https://lace.test/admin/reset-password#token=${"A".repeat(43)}`;
const sent = { delivery: { status: "sent" }, user: account } satisfies UserCreateResultDto;

async function fillForm(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole("button", { name: "Create user" }));
  const dialog = await screen.findByRole("dialog", { name: "Create user" });
  await user.type(within(dialog).getByLabelText("Email"), account.email);
  expect(within(dialog).getByRole("combobox", { name: "Role" })).toHaveTextContent("Viewer");
  await user.click(within(dialog).getByRole("combobox", { name: "Role" }));
  await user.click(screen.getByRole("option", { name: "Editor" }));
  return dialog;
}

test("submits once while pending and announces successful creation and email delivery", async () => {
  const user = userEvent.setup();
  const result = Promise.withResolvers<UserCreateResultDto>();
  const createUser = vi.fn(() => result.promise);
  renderInRouter(<CreateUserDialog />, { client: stubClient({ createUser }) });
  const dialog = await fillForm(user);
  expect(within(dialog).queryByLabelText(/password/iu)).not.toBeInTheDocument();
  const submit = within(dialog).getByRole("button", { name: "Create user" });
  await user.dblClick(submit);
  expect(createUser).toHaveBeenCalledExactlyOnceWith({ email: account.email, role: account.role });
  expect(within(dialog).getByRole("button", { name: "Creating…" })).toBeDisabled();
  await user.keyboard("{Escape}");
  expect(dialog).toBeInTheDocument();
  result.resolve(sent);
  expect(
    await screen.findByText(`Created ${account.email} and sent the access email.`),
  ).toBeInTheDocument();
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

test("shows the first-password link in transient state and clears it on Done", async () => {
  const user = userEvent.setup();
  const createUser = vi.fn(async () => ({
    delivery: { status: "failed", reason: "not_configured" } as const,
    user: account,
    link,
  }));
  const { queryClient } = renderInRouter(<CreateUserDialog />, {
    client: stubClient({ createUser }),
  });
  const invalidate = vi.spyOn(queryClient, "invalidateQueries");
  const dialog = await fillForm(user);
  await user.click(within(dialog).getByRole("button", { name: "Create user" }));
  const handoff = await screen.findByRole("dialog", { name: "Share the first-password link" });
  expect(handoff).toHaveTextContent("Email delivery is not configured");
  expect(handoff).toHaveTextContent("expires in one hour");
  expect(within(handoff).getByTestId("once-shown-link")).toHaveTextContent(link);
  await user.click(within(handoff).getByRole("button", { name: "Copy link" }));
  expect(await within(handoff).findByText("Copied to the clipboard.")).toBeInTheDocument();
  expect(await navigator.clipboard.readText()).toBe(link);
  expect(invalidate).toHaveBeenCalledWith({ queryKey: adminQueryKeys.users });
  expect(
    JSON.stringify(
      queryClient
        .getMutationCache()
        .getAll()
        .map(({ state }) => state),
    ),
  ).not.toContain(link);
  await user.click(within(handoff).getByRole("button", { name: "Done" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  await user.click(screen.getByRole("button", { name: "Create user" }));
  expect(screen.queryByText(link)).not.toBeInTheDocument();
});

test("retains the form on conflict and restores trigger focus on cancellation", async () => {
  const user = userEvent.setup();
  const createUser = vi.fn(async () => {
    throw new AdminClientError({ code: "CONFLICT", message: "Conflict.", status: 409 });
  });
  const { queryClient } = renderInRouter(<CreateUserDialog />, {
    client: stubClient({ createUser }),
  });
  const invalidate = vi.spyOn(queryClient, "invalidateQueries");
  const dialog = await fillForm(user);
  await user.click(within(dialog).getByRole("button", { name: "Create user" }));
  expect(await within(dialog).findByText(/already has an account/u)).toBeInTheDocument();
  expect(within(dialog).getByLabelText("Email")).toHaveValue(account.email);
  expect(within(dialog).getByRole("combobox", { name: "Role" })).toHaveTextContent("Editor");
  expect(invalidate).not.toHaveBeenCalled();
  await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
  const trigger = screen.getByRole("button", { name: "Create user" });
  await waitFor(() => expect(trigger).toHaveFocus());
  await user.click(trigger);
  await user.click(screen.getByRole("button", { name: "Cancel" }));
  expect(createUser).toHaveBeenCalledTimes(1);
});
