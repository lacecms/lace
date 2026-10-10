import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { Dialog, DialogContent, DialogTitle } from "../../../shared/ui/Dialog/index.js";
import { UndeliveredLink } from "./index.js";

test("explains the closed reason and shows the link once", () => {
  render(
    <Dialog open>
      <DialogContent aria-describedby={undefined}>
        <DialogTitle>Share the invitation link</DialogTitle>
        <UndeliveredLink
          link="https://lace.test/admin/accept-invite#token=secret"
          reason="not_configured"
          recipient="new@lace.test"
        />
      </DialogContent>
    </Dialog>,
  );
  expect(screen.getByRole("note")).toHaveTextContent("Email delivery is not configured");
  expect(screen.getByRole("note")).toHaveTextContent("send it to new@lace.test another way");
  expect(screen.getByTestId("once-shown-link")).toHaveTextContent(
    "https://lace.test/admin/accept-invite#token=secret",
  );
  expect(screen.getByRole("button", { name: "Copy link" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Done" })).toBeInTheDocument();
});
