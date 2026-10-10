import { screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { renderRoute, stubClient, staticSessionSource } from "../../../app/testing/index.js";

test.each(["/setup", "/content/posts"])(
  "failed guard %s retries only state without exposing content",
  async (path) => {
    const loadSetupState = vi
      .fn()
      .mockRejectedValueOnce(new Error("private detail"))
      .mockResolvedValue({ setupComplete: false });
    const setupAdmin = vi.fn();
    renderRoute(path, staticSessionSource(null), stubClient({ loadSetupState, setupAdmin }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not check setup");
    expect(screen.queryByText("private detail")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Create your administrator" }),
    ).not.toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("button", { name: "Try again" }));
    expect(
      await screen.findByRole("heading", { name: "Create your administrator" }),
    ).toBeInTheDocument();
    expect(setupAdmin).not.toHaveBeenCalled();
  },
);
