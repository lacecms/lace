import { screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { renderRoute, staticSessionSource } from "../../../app/testing/index.js";
test("protected consent route reuses the current account and consent controls", async () => {
  renderRoute(
    "/mcp/consent?mcpTransaction=transaction",
    staticSessionSource({ id: "viewer", role: "viewer" }),
  );
  expect(await screen.findByRole("heading", { name: "Connect an assistant" })).toBeInTheDocument();
  expect(await screen.findByRole("button", { name: "Allow access" })).toBeInTheDocument();
});
