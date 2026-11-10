import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { Chevron, errorMessage, hasProblems } from "./index.js";

test("finds nested problems without treating empty nodes as errors", () => {
  expect(hasProblems({ nested: { message: "Required" } })).toBe(true);
  expect(hasProblems({ nested: {} })).toBe(false);
  expect(errorMessage({ message: "Required" })).toBe("Required");
  render(
    <span data-testid="chevron">
      <Chevron open={false} />
    </span>,
  );
  expect(screen.getByTestId("chevron").firstElementChild).toHaveClass("-rotate-90");
});
