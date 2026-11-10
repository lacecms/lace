import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { BlockCardTabs } from "./index.js";

test("both tab panels remain mounted and the problem marker is accessible", () => {
  render(
    <BlockCardTabs
      contentFields={<input aria-label="Content value" />}
      contentProblems={false}
      empty={false}
      label="Text"
      settingsFields={<input aria-label="Setting value" />}
      settingsProblems
      tab="content"
    />,
  );
  expect(screen.getByRole("tab", { name: /Settings\s*\(has problems\)/u })).toBeVisible();
  expect(screen.getByLabelText("Setting value", { selector: "input" })).not.toBeVisible();
  expect(screen.getByLabelText("Content value")).toBeVisible();
});
