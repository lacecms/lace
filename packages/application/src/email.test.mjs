import { actorId } from "@lacecms/domain";
import { expect, test, vi } from "vitest";
import {
  guardedEmailSender,
  isEmailAddress,
  parseEmailSender,
  renderEmail,
  sendTestEmail,
  testEmailTemplate,
  unconfiguredEmailSender,
  validatedMessage,
} from "../dist/index.js";

const message = { subject: "Hello", text: "Body", to: "ada@example.com" };

test("accepts one bare recipient address only", () => {
  expect(isEmailAddress("ada@example.com")).toBe(true);
  for (const value of [
    "",
    "ada",
    "ada@example",
    "ada@example.com, eve@example.com",
    "Ada <ada@example.com>",
    "ada@example.com\nBcc: eve@example.com",
    `${"a".repeat(320)}@example.com`,
  ])
    expect(isEmailAddress(value)).toBe(false);
});

test("parses a sender with an optional display name", () => {
  expect(parseEmailSender("cms@example.com")).toEqual({ address: "cms@example.com" });
  expect(parseEmailSender("Lace CMS <cms@example.com>")).toEqual({
    address: "cms@example.com",
    name: "Lace CMS",
  });
  for (const value of ["", "Lace", "Lace <cms>", "Lace <cms@example.com>\r\nBcc: x@y.z", "<>"])
    expect(parseEmailSender(value)).toBeUndefined();
});

test("rejects header injection, several recipients and unbounded bodies", () => {
  expect(validatedMessage(message)).toEqual(message);
  expect(validatedMessage({ ...message, subject: "Hi\nBcc: eve@example.com" })).toBeUndefined();
  expect(validatedMessage({ ...message, subject: "Hi\rX-Header: 1" })).toBeUndefined();
  expect(validatedMessage({ ...message, to: "ada@example.com,eve@example.com" })).toBeUndefined();
  expect(validatedMessage({ ...message, to: "ada@example.com\r\n" })).toBeUndefined();
  expect(validatedMessage({ ...message, subject: " " })).toBeUndefined();
  expect(validatedMessage({ ...message, text: "" })).toBeUndefined();
  expect(validatedMessage({ ...message, text: "x".repeat(100_001) })).toBeUndefined();
});

test("guarded senders validate before delivery and never throw", async () => {
  const deliver = vi.fn(async () => ({ status: "sent" }));
  const failures = [];
  const sender = guardedEmailSender("resend", "cms@example.com", deliver, (reason) =>
    failures.push(reason),
  );
  expect(await sender.send({ ...message, subject: "a\nb" })).toEqual({
    reason: "invalid_message",
    status: "failed",
  });
  expect(deliver).not.toHaveBeenCalled();
  expect(await sender.send(message)).toEqual({ status: "sent" });
  const throwing = guardedEmailSender("smtp", "cms@example.com", async () => {
    throw new Error("connect ECONNREFUSED 10.0.0.1:587 password=secret");
  });
  expect(await throwing.send(message)).toEqual({ reason: "unavailable", status: "failed" });
  expect(failures).toEqual(["invalid_message"]);
  expect(await unconfiguredEmailSender.send(message)).toEqual({
    reason: "not_configured",
    status: "failed",
  });
});

test("escapes every paragraph in the shared HTML layout", () => {
  const rendered = renderEmail({ paragraphs: ['<script>alert("x")</script> & co'], subject: "S" });
  expect(rendered.html).toContain("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; co");
  expect(rendered.html).not.toContain("<script>");
  expect(rendered.text).toBe('<script>alert("x")</script> & co\n');
  const test = testEmailTemplate({ installationUrl: "https://cms.example.com/" });
  expect(test.subject).toBe("Lace test email");
  expect(test.text).toContain("https://cms.example.com/");
});

const admin = { id: actorId("admin-1"), role: "admin" };
const users = {
  readUserProfile: async (id) =>
    id === "admin-1" ? { disabled: false, email: "admin@example.com", name: "Admin" } : null,
};

test("sends the test email only to the acting administrator", async () => {
  const send = vi.fn(async () => ({ status: "sent" }));
  const email = { from: "cms@example.com", provider: "smtp", send };
  const result = await sendTestEmail({
    actor: admin,
    email,
    installationUrl: "https://cms.example.com/",
    users,
  });
  expect(result).toEqual({ status: "sent" });
  expect(send).toHaveBeenCalledWith(expect.objectContaining({ to: "admin@example.com" }));
});

test("denies the test email to editors and viewers", async () => {
  const send = vi.fn();
  for (const role of ["editor", "viewer"])
    await expect(
      sendTestEmail({
        actor: { id: actorId("admin-1"), role },
        email: { provider: "smtp", send },
        installationUrl: "https://cms.example.com/",
        users,
      }),
    ).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });
  expect(send).not.toHaveBeenCalled();
});

test("propagates closed failures and short-circuits an unconfigured provider", async () => {
  const input = { actor: admin, installationUrl: "https://cms.example.com/", users };
  expect(await sendTestEmail({ ...input, email: unconfiguredEmailSender })).toEqual({
    reason: "not_configured",
    status: "failed",
  });
  for (const reason of ["rejected", "rate_limited", "unavailable"])
    expect(
      await sendTestEmail({
        ...input,
        email: { provider: "resend", send: async () => ({ reason, status: "failed" }) },
      }),
    ).toEqual({ reason, status: "failed" });
});
