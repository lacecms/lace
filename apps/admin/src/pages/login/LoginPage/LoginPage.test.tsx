import { screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import {
  logOut,
  renderRoute,
  stubClient as client,
  sessionFor,
} from "../../../app/testing/index.js";
import { type AdminSession, type AdminSessionSource } from "../../../entities/session/index.js";

afterEach(() => {
  vi.restoreAllMocks();
});

test("sign-in returns to a safe route and sign-out clears the session", async () => {
  const user = userEvent.setup();
  let session: AdminSession | null = null;
  const source: AdminSessionSource = {
    get: async () => session,
    invalidate: () => undefined,
  };
  renderRoute(
    "/login?redirect=/content/posts",
    source,
    client({
      signIn: async () => {
        session = sessionFor({ id: "editor-1", role: "editor" });
      },
      signOut: async () => {
        session = null;
      },
    }),
  );

  await user.type(await screen.findByLabelText("Email"), "editor@example.test");
  await user.type(screen.getByLabelText("Password"), "correct horse battery staple");
  await user.click(screen.getByRole("button", { name: "Sign in" }));
  expect(await screen.findByRole("heading", { name: "posts" })).toBeInTheDocument();
  await logOut(user);
  expect(await screen.findByRole("heading", { name: "Sign in" })).toBeInTheDocument();
});

test("sign-in renders a focused card without protected navigation", async () => {
  renderRoute("/login", { get: async () => null, invalidate: () => undefined });
  const card = await screen.findByRole("region", { name: "Sign in" });
  expect(card).toHaveTextContent("Lace");
  expect(screen.getByLabelText("Email")).toHaveFocus();
  expect(screen.getByRole("button", { name: "Show password" })).toBeInTheDocument();
  expect(screen.queryByRole("complementary", { name: "Admin navigation" })).not.toBeInTheDocument();
});

test("sign-in links to password recovery and shows the reset notice", async () => {
  const user = userEvent.setup();
  renderRoute("/login?reset=true", { get: async () => null, invalidate: () => undefined });
  expect(
    await screen.findByText(/Your password was changed and your other sessions were signed out\./u),
  ).toHaveAttribute("role", "status");
  await user.click(screen.getByRole("link", { name: "Forgot password?" }));
  expect(await screen.findByRole("region", { name: "Forgot password?" })).toBeInTheDocument();
});
