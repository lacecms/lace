import { screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import { renderRoute, stubClient as client } from "../../../app/testing/index.js";
import { AdminClientError } from "../../../shared/api/index.js";

const token = "R".repeat(43);

afterEach(() => {
  window.history.replaceState(null, "", "/");
  localStorage.clear();
  sessionStorage.clear();
});

function openLink(fragment = `#token=${token}`) {
  window.history.replaceState(null, "", `/admin/reset-password${fragment}`);
}

const anonymous = { get: async () => null, invalidate: () => undefined };

async function submit(user: ReturnType<typeof userEvent.setup>, confirmation = "new-password-123") {
  await user.type(await screen.findByLabelText("New password"), "new-password-123");
  await user.type(screen.getByLabelText("Confirm new password"), confirmation);
  await user.click(screen.getByRole("button", { name: "Change password" }));
}

test("removes the fragment and returns to sign-in with the password-changed notice", async () => {
  const user = userEvent.setup();
  openLink();
  const confirmPasswordReset = vi.fn(async () => undefined);
  const router = renderRoute("/reset-password", anonymous, client({ confirmPasswordReset }));
  expect(await screen.findByRole("region", { name: "Choose a new password" })).toBeInTheDocument();
  expect(window.location.hash).toBe("");
  expect(JSON.stringify({ ...localStorage, ...sessionStorage })).not.toContain(token);
  await submit(user);
  expect(await screen.findByRole("heading", { name: "Sign in" })).toBeInTheDocument();
  expect(confirmPasswordReset).toHaveBeenCalledWith({ password: "new-password-123", token });
  expect(
    screen.getByText(/Your password was changed and your other sessions were signed out\./u),
  ).toHaveAttribute("role", "status");
  expect(router.state.location.href).not.toContain(token);
  expect(JSON.stringify(router.state.location)).not.toContain(token);
});

test("mismatched passwords send nothing", async () => {
  const user = userEvent.setup();
  openLink();
  const confirmPasswordReset = vi.fn();
  renderRoute("/reset-password", anonymous, client({ confirmPasswordReset }));
  await submit(user, "something-else-123");
  expect(await screen.findByRole("alert")).toHaveTextContent("The passwords do not match.");
  expect(confirmPasswordReset).not.toHaveBeenCalled();
});

test("an invalid link offers requesting a new one", async () => {
  const user = userEvent.setup();
  openLink();
  renderRoute(
    "/reset-password",
    anonymous,
    client({
      confirmPasswordReset: async () => {
        throw new AdminClientError({
          code: "RESET_INVALID",
          message: "The password reset link is invalid or has expired.",
          status: 410,
        });
      },
    }),
  );
  await submit(user);
  expect(await screen.findByRole("region", { name: "Reset link not valid" })).toBeInTheDocument();
  await user.click(screen.getByRole("link", { name: "Request a new link" }));
  expect(await screen.findByRole("region", { name: "Forgot password?" })).toBeInTheDocument();
});

test("a link without a token is invalid without a form", async () => {
  openLink("");
  renderRoute("/reset-password", anonymous);
  expect(await screen.findByRole("region", { name: "Reset link not valid" })).toBeInTheDocument();
  expect(screen.queryByLabelText("New password")).not.toBeInTheDocument();
});

test("other failures stay on the form", async () => {
  const user = userEvent.setup();
  openLink();
  renderRoute(
    "/reset-password",
    anonymous,
    client({
      confirmPasswordReset: async () => {
        throw new AdminClientError({ message: "The Lace API could not be reached." });
      },
    }),
  );
  await submit(user);
  await waitFor(() =>
    expect(screen.getAllByRole("alert").at(-1)).toHaveTextContent("could not be reached"),
  );
  expect(screen.getByLabelText("New password")).toHaveValue("new-password-123");
});
