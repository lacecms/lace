import { screen, within } from "@testing-library/react";
import { expect, test } from "vitest";
import { renderInRouter } from "../../../app/testing/index.js";
import { InvitationsTable } from "./index.js";

const now = Date.parse("2026-10-02T00:00:00.000Z");
const pending = {
  createdAt: "2026-10-01T00:00:00.000Z",
  email: "new@lace.test",
  expiresAt: "2026-10-04T00:00:00.000Z",
  id: "invitation-1",
  invitedBy: "Ada Admin",
  role: "editor" as const,
  state: "pending" as const,
};
const expired = {
  ...pending,
  email: "late@lace.test",
  expiresAt: "2026-09-30T00:00:00.000Z",
  id: "invitation-2",
  role: "viewer" as const,
  state: "expired" as const,
};

test("lists email, role, inviter, relative expiry and state with row actions", async () => {
  renderInRouter(<InvitationsTable invitations={[pending, expired]} now={now} />, {
    session: { id: "admin-1", role: "admin" },
  });
  const table = await screen.findByRole("table", { name: "Pending invitations" });
  const pendingRow = within(table).getByRole("row", { name: /new@lace\.test/u });
  expect(pendingRow).toHaveTextContent("Editor");
  expect(pendingRow).toHaveTextContent("Ada Admin");
  expect(pendingRow).toHaveTextContent("in 2 days");
  expect(pendingRow).toHaveTextContent("Pending");
  expect(
    within(pendingRow).getByRole("button", { name: "Resend invitation to new@lace.test" }),
  ).toBeVisible();
  expect(
    within(pendingRow).getByRole("button", { name: "Revoke invitation for new@lace.test" }),
  ).toBeVisible();
  const expiredRow = within(table).getByRole("row", { name: /late@lace\.test/u });
  expect(expiredRow).toHaveTextContent("Viewer");
  expect(expiredRow).toHaveTextContent("Expired 2 days ago");
  expect(within(expiredRow).getAllByText("Expired")).toHaveLength(1);
  expect(table).not.toHaveTextContent("invitation-1");
});
