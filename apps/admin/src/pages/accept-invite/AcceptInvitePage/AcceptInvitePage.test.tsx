import { screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import { renderRoute, sessionFor, stubClient as client } from "../../../app/testing/index.js";
import type { AdminSession, AdminSessionSource } from "../../../entities/session/index.js";
import { AdminClientError } from "../../../shared/api/index.js";

const token = "Inv1tat10n-T0ken_abcdefghijklmnopqrstuvwxyz".slice(0, 43);
const invitation = {
  email: "new@lace.test",
  expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
  role: "editor" as const,
};

afterEach(() => {
  window.history.replaceState(null, "", "/");
  localStorage.clear();
  sessionStorage.clear();
});

function openLink(fragment = `#token=${token}`) {
  window.history.replaceState(null, "", `/admin/accept-invite${fragment}`);
}

function anonymous(): AdminSessionSource {
  return { get: async () => null, invalidate: () => undefined };
}

test("reads the token from the fragment, removes it, and keeps it out of storage and routing", async () => {
  openLink();
  const inspectInvitation = vi.fn(async () => invitation);
  const router = renderRoute("/accept-invite", anonymous(), client({ inspectInvitation }));
  expect(await screen.findByLabelText("Email")).toHaveValue("new@lace.test");
  expect(screen.getByRole("region", { name: "Accept invitation" })).toBeInTheDocument();
  expect(inspectInvitation).toHaveBeenCalledWith(token);
  expect(window.location.hash).toBe("");
  expect(window.location.href).not.toContain(token);
  expect(JSON.stringify({ ...localStorage })).not.toContain(token);
  expect(JSON.stringify({ ...sessionStorage })).not.toContain(token);
  expect(JSON.stringify(router.state.location)).not.toContain(token);
  expect(document.body).not.toHaveTextContent(token);
});

test("shows the invited email read-only and the role, then signs in and opens Content", async () => {
  const user = userEvent.setup();
  openLink();
  let session: AdminSession | null = null;
  const acceptInvitation = vi.fn(async () => ({ email: "new@lace.test" }));
  const signIn = vi.fn(async () => {
    session = sessionFor({ email: "new@lace.test", id: "editor-2", role: "editor" });
  });
  renderRoute(
    "/accept-invite",
    { get: async () => session, invalidate: () => undefined },
    client({ acceptInvitation, inspectInvitation: async () => invitation, signIn }),
  );
  const email = await screen.findByLabelText("Email");
  expect(email).toHaveAttribute("readonly");
  expect(screen.getByText("Role: Editor")).toBeInTheDocument();
  expect(screen.getByText("Edits drafts and uploads media.")).toBeInTheDocument();
  const password = screen.getByLabelText("Password");
  expect(password).toHaveAttribute("minlength", "12");
  expect(password).toHaveAccessibleDescription("At least 12 characters.");
  expect(screen.getByRole("button", { name: "Show password" })).toBeInTheDocument();
  await user.type(screen.getByLabelText("Display name (optional)"), " Nia New ");
  await user.type(password, "long-password-123");
  await user.click(screen.getByRole("button", { name: "Create account" }));
  expect(await screen.findByRole("heading", { name: "Content", level: 1 })).toBeInTheDocument();
  expect(acceptInvitation).toHaveBeenCalledWith({
    displayName: "Nia New",
    password: "long-password-123",
    token,
  });
  expect(signIn).toHaveBeenCalledWith("new@lace.test", "long-password-123");
  expect(screen.getByRole("link", { name: "Media" })).toBeInTheDocument();
});

test("an invalid invitation explains itself without a form", async () => {
  openLink();
  renderRoute(
    "/accept-invite",
    anonymous(),
    client({
      inspectInvitation: async () => {
        throw new AdminClientError({
          code: "INVITATION_INVALID",
          message: "The invitation is invalid or has expired.",
          status: 410,
        });
      },
    }),
  );
  const card = await screen.findByRole("region", { name: "Invitation not valid" });
  expect(card).toHaveTextContent("Ask the person who invited you to send a new invitation.");
  expect(screen.queryByLabelText("Password")).not.toBeInTheDocument();
});

test("a link without a well-formed token is invalid without any request", async () => {
  openLink("#token=short");
  const inspectInvitation = vi.fn();
  renderRoute("/accept-invite", anonymous(), client({ inspectInvitation }));
  expect(await screen.findByRole("region", { name: "Invitation not valid" })).toBeInTheDocument();
  expect(inspectInvitation).not.toHaveBeenCalled();
  expect(window.location.hash).toBe("");
});

test("an invitation that expires before submission switches to the explanation", async () => {
  const user = userEvent.setup();
  openLink();
  renderRoute(
    "/accept-invite",
    anonymous(),
    client({
      acceptInvitation: async () => {
        throw new AdminClientError({ code: "INVITATION_INVALID", message: "Gone.", status: 410 });
      },
      inspectInvitation: async () => invitation,
    }),
  );
  await user.type(await screen.findByLabelText("Password"), "long-password-123");
  await user.click(screen.getByRole("button", { name: "Create account" }));
  expect(await screen.findByRole("region", { name: "Invitation not valid" })).toBeInTheDocument();
});

test("a failed check offers Try again", async () => {
  const user = userEvent.setup();
  openLink();
  let fail = true;
  const inspectInvitation = vi.fn(async () => {
    if (fail) throw new AdminClientError({ message: "The Lace API could not be reached." });
    return invitation;
  });
  renderRoute("/accept-invite", anonymous(), client({ inspectInvitation }));
  expect(await screen.findByRole("alert")).toHaveTextContent("could not be reached");
  fail = false;
  await user.click(screen.getByRole("button", { name: "Try again" }));
  expect(await screen.findByLabelText("Password")).toBeInTheDocument();
  expect(inspectInvitation).toHaveBeenLastCalledWith(token);
});

test("a signed-in visitor keeps the session and can still use the link", async () => {
  openLink();
  const invalidate = vi.fn();
  const inspectInvitation = vi.fn(async () => invitation);
  renderRoute(
    "/accept-invite",
    { get: async () => sessionFor({ id: "admin-1", role: "admin" }), invalidate },
    client({ inspectInvitation }),
  );
  expect(await screen.findByLabelText("Password")).toBeInTheDocument();
  await waitFor(() => expect(inspectInvitation).toHaveBeenCalledWith(token));
  expect(invalidate).not.toHaveBeenCalled();
});
