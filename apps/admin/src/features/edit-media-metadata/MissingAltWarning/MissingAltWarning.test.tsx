import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { MissingAltWarning } from "./index.js";

test("warns that media without alt text is presented as decorative", () => {
  render(<MissingAltWarning />);
  expect(screen.getByText(/has no alt text/)).toHaveTextContent("presented as decorative");
});

test("accepts a context-specific message and an id for descriptions", () => {
  render(<MissingAltWarning id="alt-warning">No alt text here.</MissingAltWarning>);
  expect(screen.getByText("No alt text here.").parentElement).toHaveAttribute("id", "alt-warning");
});
