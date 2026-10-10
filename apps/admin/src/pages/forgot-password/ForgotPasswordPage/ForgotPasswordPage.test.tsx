import { screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { renderRoute, sessionFor, stubClient as client } from "../../../app/testing/index.js";
import { AdminClientError } from "../../../shared/api/index.js";

const anonymous = { get: async () => null, invalidate: () => undefined };

async function request(address: string) {
  const user = userEvent.setup();
  const requestPasswordReset = vi.fn(async () => undefined);
  renderRoute("/forgot-password", anonymous, client({ requestPasswordReset }));
  const email = await screen.findByLabelText("Email");
  expect(email).toHaveFocus();
  await user.type(email, address);
  await user.click(screen.getByRole("button", { name: "Send reset link" }));
  await waitFor(() => expect(requestPasswordReset).toHaveBeenCalledWith(address));
  const confirmation = await screen.findByText(/If an account exists for/u);
  expect(confirmation).toHaveAttribute("role", "status");
  return confirmation.textContent?.replace(address, "<address>");
}

test("shows the same confirmation whether or not the address has an account", async () => {
  const known = await request("admin@lace.test");
  document.body.replaceChildren();
  const unknown = await request("nobody@lace.test");
  expect(known).toBe(unknown);
  expect(known).toContain("If an account exists for <address>");
  expect(screen.getByRole("region", { name: "Check your email" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Back to sign in" })).toBeInTheDocument();
});

test("a refused request stays on the form with the error", async () => {
  const user = userEvent.setup();
  renderRoute(
    "/forgot-password",
    anonymous,
    client({
      requestPasswordReset: async () => {
        throw new AdminClientError({
          code: "RATE_LIMITED",
          message: "Too many requests were received.",
          status: 429,
        });
      },
    }),
  );
  await user.type(await screen.findByLabelText("Email"), "admin@lace.test");
  await user.click(screen.getByRole("button", { name: "Send reset link" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Too many requests were received.");
  expect(screen.getByLabelText("Email")).toHaveValue("admin@lace.test");
});

test("a signed-in visitor can open the screen without leaving it", async () => {
  renderRoute("/forgot-password", {
    get: async () => sessionFor({ id: "editor-1", role: "editor" }),
    invalidate: () => undefined,
  });
  expect(await screen.findByRole("region", { name: "Forgot password?" })).toBeInTheDocument();
});
