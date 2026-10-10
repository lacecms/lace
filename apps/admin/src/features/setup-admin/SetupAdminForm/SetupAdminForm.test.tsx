import { screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { renderRoute, stubClient, staticSessionSource } from "../../../app/testing/index.js";
import { AdminClientError, type AdminClient } from "../../../shared/api/index.js";

const password = "correct horse battery staple";
const token = "A".repeat(43);
const email = "admin@lace.test";
function open(overrides: Partial<AdminClient> = {}) {
  return renderRoute(
    "/setup?redirect=/content/posts",
    staticSessionSource(null),
    stubClient({ loadSetupState: async () => ({ setupComplete: false }), ...overrides }),
  );
}
async function fill() {
  const user = userEvent.setup();
  await user.type(await screen.findByLabelText("Email"), email);
  await user.type(screen.getByLabelText("Password"), password);
  await user.type(screen.getByLabelText("Bootstrap token"), token);
  return user;
}

test("form is focused, validates shared constraints and never exposes secret values in errors", async () => {
  const setupAdmin = vi.fn();
  open({ setupAdmin });
  const input = await screen.findByLabelText("Email");
  expect(input).toHaveFocus();
  const user = userEvent.setup();
  await user.type(input, "bad-email");
  await user.type(screen.getByLabelText("Password"), "short");
  await user.type(screen.getByLabelText("Bootstrap token"), "short-token");
  await user.click(screen.getByRole("button", { name: "Create administrator" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("12–1024");
  expect(screen.getByLabelText("Email")).toHaveAttribute("aria-invalid", "true");
  expect(screen.getByLabelText("Password")).toHaveAttribute("aria-invalid", "true");
  expect(screen.getByLabelText("Bootstrap token")).toHaveAttribute("aria-invalid", "true");
  expect(screen.getByRole("alert")).not.toHaveTextContent("short-token");
  expect(setupAdmin).not.toHaveBeenCalled();
});

test("valid form prevents duplicate submission, clears credentials and offers normal sign-in", async () => {
  let resolve: () => void = () => undefined;
  const setupAdmin = vi.fn(
    () =>
      new Promise<void>((done) => {
        resolve = done;
      }),
  );
  const router = open({ setupAdmin });
  const user = await fill();
  await user.click(screen.getByRole("button", { name: "Show password" }));
  expect(screen.getByRole("button", { name: "Hide password" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await user.click(screen.getByRole("button", { name: "Create administrator" }));
  expect(screen.getByRole("button", { name: "Checking setup…" })).toBeDisabled();
  expect(setupAdmin).toHaveBeenCalledExactlyOnceWith({ email, password, token });
  resolve();
  expect(await screen.findByRole("heading", { name: "Sign in" })).toBeInTheDocument();
  expect(screen.getByRole("status")).toHaveTextContent("Setup is complete");
  expect(screen.getByLabelText("Password")).toHaveValue("");
  expect(router.state.location.search.redirect).toBe("/content/posts");
  expect(JSON.stringify(router.state.location)).not.toContain(token);
  expect(JSON.stringify(router.state.location)).not.toContain(password);
  expect(localStorage.length).toBe(0);
  expect(sessionStorage.length).toBe(0);
});

test.each([404, undefined])(
  "ambiguous outcome %s confirms completion without replay or automatic login",
  async (status) => {
    const loadSetupState = vi
      .fn()
      .mockResolvedValueOnce({ setupComplete: false })
      .mockResolvedValue({ setupComplete: true });
    const setupAdmin = vi
      .fn()
      .mockRejectedValue(
        new AdminClientError({ message: token, ...(status === undefined ? {} : { status }) }),
      );
    const signIn = vi.fn();
    open({ loadSetupState, setupAdmin, signIn });
    const user = await fill();
    await user.click(screen.getByRole("button", { name: "Create administrator" }));
    expect(await screen.findByRole("heading", { name: "Sign in" })).toBeInTheDocument();
    expect(setupAdmin).toHaveBeenCalledOnce();
    expect(signIn).not.toHaveBeenCalled();
    expect(loadSetupState).toHaveBeenCalledTimes(2);
  },
);

test.each([404, undefined])(
  "incomplete outcome %s retains form for explicit same-token/email retry",
  async (status) => {
    const setupAdmin = vi
      .fn()
      .mockRejectedValueOnce(
        new AdminClientError({ message: password, ...(status === undefined ? {} : { status }) }),
      )
      .mockResolvedValueOnce(undefined);
    open({ setupAdmin });
    const user = await fill();
    await user.click(screen.getByRole("button", { name: "Create administrator" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("same token and email");
    expect(screen.getByLabelText("Email")).toHaveValue(email);
    expect(screen.getByRole("alert")).not.toHaveTextContent(password);
    expect(setupAdmin).toHaveBeenCalledOnce();
    await user.click(screen.getByRole("button", { name: "Create administrator" }));
    expect(await screen.findByRole("heading", { name: "Sign in" })).toBeInTheDocument();
    expect(setupAdmin).toHaveBeenLastCalledWith({ email, password, token });
  },
);

test("failed reconciliation disables mutations and retry repeats only state", async () => {
  const loadSetupState = vi
    .fn()
    .mockResolvedValueOnce({ setupComplete: false })
    .mockRejectedValueOnce(new Error("private detail"))
    .mockResolvedValueOnce({ setupComplete: false });
  const setupAdmin = vi
    .fn()
    .mockRejectedValue(new AdminClientError({ message: "Missing", status: 404 }));
  open({ loadSetupState, setupAdmin });
  const user = await fill();
  await user.click(screen.getByRole("button", { name: "Create administrator" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Could not check setup");
  expect(screen.getByRole("button", { name: "Create administrator" })).toBeDisabled();
  await user.click(screen.getByRole("button", { name: "Try again" }));
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Create administrator" })).toBeEnabled(),
  );
  expect(setupAdmin).toHaveBeenCalledOnce();
  expect(loadSetupState).toHaveBeenCalledTimes(3);
});

test.each([429, 403, 422])(
  "rejection %s stays sanitized without repeated reads or mutations",
  async (status) => {
    const setupAdmin = vi.fn().mockRejectedValue(new AdminClientError({ message: token, status }));
    const loadSetupState = vi.fn().mockResolvedValue({ setupComplete: false });
    open({ setupAdmin, loadSetupState });
    const user = await fill();
    await user.click(screen.getByRole("button", { name: "Create administrator" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(
      status === 429 ? "Too many setup attempts" : "Could not create",
    );
    expect(alert).not.toHaveTextContent(token);
    expect(loadSetupState).toHaveBeenCalledOnce();
    expect(setupAdmin).toHaveBeenCalledOnce();
  },
);
