import { screen, within } from "@testing-library/react";
import { expect, test } from "vitest";
import { renderInRouter } from "../../app/testing/index.js";
import { BuildTokenTable } from "./BuildTokenTable.js";

const now = Date.parse("2026-09-27T12:00:00.000Z");
const base = {
  capabilities: ["content:build:read"] as ["content:build:read"],
  tokenPrefix: "lace_bt_ab",
};

test("lists metadata with relative times and revoke only for active tokens", async () => {
  renderInRouter(
    <BuildTokenTable
      now={now}
      tokens={[
        { ...base, createdAt: "2026-09-27T10:00:00.000Z", id: "token-1", name: "Production" },
        {
          ...base,
          createdAt: "2026-09-20T12:00:00.000Z",
          id: "token-2",
          lastUsedAt: "2026-09-26T12:00:00.000Z",
          name: "Old",
          revokedAt: "2026-09-27T11:00:00.000Z",
        },
      ]}
    />,
  );
  const table = await screen.findByRole("table", { name: "Build tokens" });
  const [production, old] = within(table).getAllByRole("row").slice(1);
  expect(production).toHaveTextContent("2 hours ago");
  expect(within(production!).getByText("2 hours ago")).toHaveAttribute("title");
  expect(production).toHaveTextContent("Never");
  expect(production).toHaveTextContent("Active");
  expect(within(production!).getByRole("button", { name: "Revoke Production" })).toBeVisible();
  expect(old).toHaveTextContent("yesterday");
  expect(old).toHaveTextContent("Revoked");
  expect(within(old!).queryByRole("button")).not.toBeInTheDocument();
  expect(table).not.toHaveTextContent("token-1");
});
