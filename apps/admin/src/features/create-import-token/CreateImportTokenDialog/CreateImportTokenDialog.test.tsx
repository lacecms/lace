import { screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { renderInRouter, stubClient } from "../../../app/testing/index.js";
import { AdminClientError, adminQueryKeys } from "../../../shared/api/index.js";
import { CreateImportTokenDialog } from "./index.js";

const issued = {
  capabilities: ["content:import", "content:publish"] as ["content:import", "content:publish"],
  createdAt: "2026-10-31T10:00:00.000Z",
  createdBy: { email: "admin@lace.test", id: "admin-1" },
  expiresAt: "2026-11-03T10:00:00.000Z",
  id: "import-1",
  name: "Framer import",
  token: "import-plaintext-secret-value",
  tokenPrefix: "import-p",
};

test("issues a publishing token for 3 days, shows it once and clears it", async () => {
  const user = userEvent.setup();
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
  });
  const createImportToken = vi.fn(async () => issued);
  const { queryClient } = renderInRouter(<CreateImportTokenDialog />, {
    client: stubClient({ createImportToken }),
    session: { id: "admin-1", role: "admin" },
  });
  await user.click(await screen.findByRole("button", { name: "Create import token" }));
  const dialog = await screen.findByRole("dialog", { name: "Create import token" });
  await user.type(within(dialog).getByLabelText("Token name"), " Framer import ");
  // Radix Select opens reliably in jsdom by keyboard.
  within(dialog).getByRole("combobox", { name: "Expires after" }).focus();
  await user.keyboard("{Enter}");
  await user.click(await screen.findByRole("option", { name: "3 days" }));
  const publish = within(dialog).getByRole("checkbox", { name: "Allow publishing" });
  expect(publish).not.toBeChecked();
  await user.click(publish);
  await user.click(within(dialog).getByRole("button", { name: "Create import token" }));
  const shown = await screen.findByRole("dialog", { name: "Copy your import token" });
  expect(createImportToken).toHaveBeenCalledWith({
    allowPublish: true,
    expiresInDays: 3,
    name: "Framer import",
  });
  expect(within(shown).getByTestId("issued-import-token")).toHaveTextContent(issued.token);
  expect(shown).toHaveTextContent("It expires");
  expect(
    JSON.stringify(queryClient.getQueryData(adminQueryKeys.importTokens) ?? null),
  ).not.toContain(issued.token);
  expect(
    JSON.stringify(
      queryClient
        .getMutationCache()
        .getAll()
        .map((mutation) => mutation.state.data),
    ),
  ).not.toContain(issued.token);
  await user.click(within(shown).getByRole("button", { name: "Done" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(document.body).not.toHaveTextContent(issued.token);
  await user.click(screen.getByRole("button", { name: "Create import token" }));
  const reopened = await screen.findByRole("dialog", { name: "Create import token" });
  expect(within(reopened).getByLabelText("Token name")).toHaveValue("");
  expect(within(reopened).getByRole("checkbox", { name: "Allow publishing" })).not.toBeChecked();
});

test("people without publish permission are not offered publishing", async () => {
  const user = userEvent.setup();
  const createImportToken = vi.fn(async () => ({ ...issued, capabilities: ["content:import"] }));
  renderInRouter(<CreateImportTokenDialog />, {
    client: stubClient({ createImportToken: createImportToken as never }),
    session: {
      id: "admin-1",
      permissions: ["content:read", "content:write", "media:write", "settings:manage"],
      role: "admin",
    },
  });
  await user.click(await screen.findByRole("button", { name: "Create import token" }));
  const dialog = await screen.findByRole("dialog", { name: "Create import token" });
  expect(within(dialog).queryByRole("checkbox", { name: "Allow publishing" })).toBeNull();
  await user.type(within(dialog).getByLabelText("Token name"), "Drafts only");
  await user.keyboard("{Enter}");
  await screen.findByRole("dialog", { name: "Copy your import token" });
  expect(createImportToken).toHaveBeenCalledWith({
    allowPublish: false,
    expiresInDays: 1,
    name: "Drafts only",
  });
});

test("a failed creation stays on the form without plaintext", async () => {
  const user = userEvent.setup();
  renderInRouter(<CreateImportTokenDialog />, {
    client: stubClient({
      createImportToken: async () => {
        throw new AdminClientError({ message: "Too many token changes.", status: 429 });
      },
    }),
    session: { id: "admin-1", role: "admin" },
  });
  await user.click(await screen.findByRole("button", { name: "Create import token" }));
  await user.type(screen.getByLabelText("Token name"), "Framer");
  await user.keyboard("{Enter}");
  const dialog = await screen.findByRole("dialog", { name: "Create import token" });
  expect(await within(dialog).findByText("Token not created")).toBeInTheDocument();
  expect(within(dialog).getByLabelText("Token name")).toHaveValue("Framer");
});
