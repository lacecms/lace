import type { AdminSettingsStatusDto, EmailTestResultDto } from "@lacecms/contracts";
import { screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import {
  renderRoute,
  staticSessionSource,
  stubClient as client,
} from "../../../app/testing/index.js";
import { AdminClientError } from "../../../shared/api/index.js";

afterEach(() => {
  vi.restoreAllMocks();
});

const admin = staticSessionSource({ email: "ada@lace.test", id: "admin-1", role: "admin" });

function status(email: AdminSettingsStatusDto["email"]): AdminSettingsStatusDto {
  return { configuredModels: 1, email, engineVersion: "0.1.0-alpha.4", ready: true };
}

function mount(email: AdminSettingsStatusDto["email"], sendTestEmail = vi.fn()) {
  renderRoute(
    "/settings",
    admin,
    client({ loadSettingsStatus: async () => status(email), sendTestEmail }),
  );
  return sendTestEmail;
}

test.each([
  ["log", "Development log"],
  ["smtp", "SMTP"],
  ["resend", "Resend"],
  ["cloudflare", "Cloudflare Email Service"],
] as const)("names the %s provider and its sender", async (provider, label) => {
  mount({ from: "Lace <cms@lace.test>", provider });
  const card = await screen.findByRole("group", { name: "Email delivery" });
  await waitFor(() => expect(card).toHaveTextContent(label));
  expect(card).toHaveTextContent("Sends as Lace <cms@lace.test>.");
  expect(within(card).getByRole("button", { name: "Send test email" })).toBeEnabled();
  expect(card).toHaveTextContent("Sends a test message to ada@lace.test.");
});

test("an unconfigured provider offers no test action", async () => {
  const send = mount({ provider: "none" });
  const card = await screen.findByRole("group", { name: "Email delivery" });
  await waitFor(() => expect(card).toHaveTextContent("Not configured"));
  expect(within(card).queryByRole("button", { name: "Send test email" })).not.toBeInTheDocument();
  expect(send).not.toHaveBeenCalled();
});

test("a sent test is announced for the administrator's own address", async () => {
  const user = userEvent.setup();
  let resolve: (value: EmailTestResultDto) => void = () => undefined;
  const send = mount(
    { from: "cms@lace.test", provider: "smtp" },
    vi.fn(() => new Promise<EmailTestResultDto>((done) => (resolve = done))),
  );
  const card = await screen.findByRole("group", { name: "Email delivery" });
  await user.click(await within(card).findByRole("button", { name: "Send test email" }));
  expect(within(card).getByRole("button", { name: "Sending…" })).toBeDisabled();
  resolve({ status: "sent" });
  expect(
    await screen.findByText("The provider accepted a test message for ada@lace.test."),
  ).toBeInTheDocument();
  expect(send).toHaveBeenCalledOnce();
});

test.each([
  ["rejected", "The provider rejected the sender or recipient", "domain are verified"],
  ["rate_limited", "The provider's sending limit was reached", "quota to reset"],
  ["unavailable", "The provider could not be reached", "server logs"],
  ["not_configured", "Email delivery is not configured", "LACE_EMAIL_PROVIDER"],
  ["invalid_message", "The test message could not be addressed", "valid email address"],
] as const)("explains a %s failure without provider text", async (reason, title, detail) => {
  const user = userEvent.setup();
  mount(
    { from: "cms@lace.test", provider: "resend" },
    vi.fn(async () => ({ reason, status: "failed" as const })),
  );
  const card = await screen.findByRole("group", { name: "Email delivery" });
  await user.click(await within(card).findByRole("button", { name: "Send test email" }));
  const alert = await within(card).findByRole("alert");
  expect(alert).toHaveTextContent(title);
  expect(alert).toHaveTextContent(detail);
});

test("a rate-limited request shows the closed rate-limit message", async () => {
  const user = userEvent.setup();
  mount(
    { from: "cms@lace.test", provider: "smtp" },
    vi.fn(async () => {
      throw new AdminClientError({
        code: "RATE_LIMITED",
        message: "Too many requests. Try again later.",
        status: 429,
      });
    }),
  );
  const card = await screen.findByRole("group", { name: "Email delivery" });
  await user.click(await within(card).findByRole("button", { name: "Send test email" }));
  expect(await within(card).findByText("Too many requests. Try again later.")).toBeInTheDocument();
});

test("refresh updates the card with the other status data", async () => {
  const user = userEvent.setup();
  let email: AdminSettingsStatusDto["email"] = { provider: "none" };
  renderRoute("/settings", admin, client({ loadSettingsStatus: async () => status(email) }));
  const card = await screen.findByRole("group", { name: "Email delivery" });
  await waitFor(() => expect(card).toHaveTextContent("Not configured"));
  email = { from: "cms@lace.test", provider: "resend" };
  await user.click(screen.getByRole("button", { name: "Refresh status" }));
  await waitFor(() => expect(card).toHaveTextContent("Resend"));
});

test("editors see access denied and issue no status or test requests", async () => {
  const loadSettingsStatus = vi.fn();
  const sendTestEmail = vi.fn();
  renderRoute(
    "/settings",
    staticSessionSource({ id: "editor-1", role: "editor" }),
    client({ loadSettingsStatus, sendTestEmail }),
  );
  expect(await screen.findByRole("heading", { name: "Access denied" })).toBeInTheDocument();
  expect(loadSettingsStatus).not.toHaveBeenCalled();
  expect(sendTestEmail).not.toHaveBeenCalled();
});
