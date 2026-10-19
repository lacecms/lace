import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { DropOverlay } from "./index.js";

test("the drop overlay names the target and the upload constraints", () => {
  render(<DropOverlay />);
  expect(screen.getByText("Drop images to upload")).toBeInTheDocument();
  expect(screen.getByText("JPEG, PNG, GIF, WebP, or AVIF. Maximum 10 MiB.")).toBeInTheDocument();
});
