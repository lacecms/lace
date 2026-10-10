import type { EmailTestResultDto } from "@lacecms/contracts";
import { screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import { renderInRouter, stubClient } from "../../../app/testing/index.js";
import { emailFailureText, SendTestEmail } from "./index.js";

afterEach(() => {
  vi.restoreAllMocks();
});

test("sends without choosing a recipient and announces acceptance", async () => {
  const user = userEvent.setup();
  const sendTestEmail = vi.fn(async (): Promise<EmailTestResultDto> => ({ status: "sent" }));
  renderInRouter(<SendTestEmail address="ada@lace.test" />, {
    client: stubClient({ sendTestEmail }),
  });
  const button = await screen.findByRole("button", { name: "Send test email" });
  expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  await user.click(button);
  expect(
    await screen.findByText("The provider accepted a test message for ada@lace.test."),
  ).toBeInTheDocument();
  expect(sendTestEmail).toHaveBeenCalledOnce();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

test("a closed failure is explained and cleared by the next attempt", async () => {
  const user = userEvent.setup();
  let result: EmailTestResultDto = { reason: "unavailable", status: "failed" };
  renderInRouter(<SendTestEmail address="ada@lace.test" />, {
    client: stubClient({ sendTestEmail: async () => result }),
  });
  await user.click(await screen.findByRole("button", { name: "Send test email" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(emailFailureText("unavailable").title);
  result = { status: "sent" };
  await user.click(screen.getByRole("button", { name: "Send test email" }));
  await screen.findByText("The provider accepted a test message for ada@lace.test.");
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

test("every failure reason has distinct guidance without provider text", () => {
  const reasons = ["invalid_message", "not_configured", "rate_limited", "rejected", "unavailable"];
  const titles = reasons.map((reason) => emailFailureText(reason as never).title);
  expect(new Set(titles).size).toBe(reasons.length);
});
