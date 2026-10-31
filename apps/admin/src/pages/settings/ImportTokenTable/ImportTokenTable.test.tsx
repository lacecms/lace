import { screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { renderInRouter, stubClient } from "../../../app/testing/index.js";
import { ImportTokenTable } from "./index.js";

const now = Date.parse("2026-11-01T12:00:00.000Z");
const base = {
  capabilities: ["content:import"] as ["content:import"],
  createdAt: "2026-11-01T10:00:00.000Z",
  createdBy: { displayName: "Ada Admin", email: "admin@lace.test", id: "admin-1" },
  expiresAt: "2026-11-02T10:00:00.000Z",
  tokenPrefix: "abcdefgh",
};
const tokens = [
  { ...base, id: "active", name: "Active import" },
  {
    ...base,
    capabilities: ["content:import", "content:publish"] as ["content:import", "content:publish"],
    createdBy: { email: "other@lace.test", id: "admin-2" },
    expiresAt: "2026-11-01T11:00:00.000Z",
    id: "expired",
    lastUsedAt: "2026-11-01T10:30:00.000Z",
    name: "Expired import",
  },
  { ...base, id: "revoked", name: "Revoked import", revokedAt: "2026-11-01T11:00:00.000Z" },
];

test("lists import tokens with creator, expiry, access and derived status", async () => {
  renderInRouter(<ImportTokenTable now={now} tokens={tokens} />, {
    session: { id: "admin-1", role: "admin" },
  });
  const rows = await screen.findAllByRole("row");
  const active = within(rows[1]!);
  expect(active.getByText("Ada Admin")).toBeInTheDocument();
  expect(active.getByText("Never")).toBeInTheDocument();
  expect(active.getByText("Drafts and media")).toBeInTheDocument();
  expect(active.getByText("Active")).toBeInTheDocument();
  expect(active.getByText("2 hours ago")).toHaveAttribute("title");
  expect(active.getByRole("button", { name: "Revoke Active import" })).toBeInTheDocument();
  const expired = within(rows[2]!);
  expect(expired.getByText("other@lace.test")).toBeInTheDocument();
  expect(expired.getByText("Drafts, media, publish")).toBeInTheDocument();
  expect(expired.getByText("Expired")).toBeInTheDocument();
  expect(expired.queryByRole("button", { name: /Revoke/u })).toBeNull();
  const revoked = within(rows[3]!);
  expect(revoked.getByText("Revoked")).toBeInTheDocument();
  expect(revoked.queryByRole("button", { name: /Revoke/u })).toBeNull();
  expect(document.body).not.toHaveTextContent("secret");
});

test("revoking asks for confirmation naming the token", async () => {
  const user = userEvent.setup();
  const revokeImportToken = vi.fn(async () => ({
    ...tokens[0]!,
    revokedAt: "2026-11-01T12:00:00.000Z",
  }));
  renderInRouter(<ImportTokenTable now={now} tokens={[tokens[0]!]} />, {
    client: stubClient({ revokeImportToken }),
    session: { id: "admin-1", role: "admin" },
  });
  await user.click(await screen.findByRole("button", { name: "Revoke Active import" }));
  const dialog = await screen.findByRole("dialog", { name: "Revoke import token?" });
  expect(dialog).toHaveTextContent("Active import");
  await user.click(within(dialog).getByRole("button", { name: "Revoke token" }));
  expect(revokeImportToken).toHaveBeenCalledWith("active");
});
