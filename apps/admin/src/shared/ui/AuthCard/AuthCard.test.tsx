import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { AuthCard } from "./index.js";

test("names the card region after its heading and renders its task", () => {
  render(
    <AuthCard description="Choose a new password." title="Reset password">
      <button type="button">Continue</button>
    </AuthCard>,
  );
  const card = screen.getByRole("region", { name: "Reset password" });
  expect(card).toHaveTextContent("Lace");
  expect(card).toHaveTextContent("Choose a new password.");
  expect(screen.getByRole("main")).toContainElement(
    screen.getByRole("button", { name: "Continue" }),
  );
});
