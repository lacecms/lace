import { expect, test } from "vitest";
import { createCloudflareEmailSender, parseCloudflareSettings } from "../dist/index.js";

const message = { subject: "Hello", text: "Body", to: "ada@example.com" };
const base = {
  DB: { batch() {}, prepare() {} },
  LACE_AUTH_SECRET: "worker-auth-secret-that-is-long-enough-for-better-auth",
  LACE_PUBLIC_BASE_URL: "https://cms.lace.test/",
  MEDIA: { delete() {}, get() {}, head() {}, put() {} },
};

function failing(code) {
  return {
    send: async () => {
      throw Object.assign(new Error(`${code}: ada@example.com refused`), { code });
    },
  };
}

test("sends structured messages through the binding with a named sender", async () => {
  const sent = [];
  const sender = createCloudflareEmailSender({
    binding: { send: async (value) => sent.push(value) },
    from: "Lace CMS <cms@example.com>",
    timeoutMs: 1_000,
  });
  expect(await sender.send({ ...message, html: "<p>Body</p>" })).toEqual({ status: "sent" });
  expect(sent).toEqual([
    {
      from: { email: "cms@example.com", name: "Lace CMS" },
      html: "<p>Body</p>",
      subject: "Hello",
      text: "Body",
      to: "ada@example.com",
    },
  ]);
});

test("maps every documented binding error code to a closed reason", async () => {
  const expected = {
    E_CONTENT_TOO_LARGE: "invalid_message",
    E_DAILY_LIMIT_EXCEEDED: "rate_limited",
    E_DELIVERY_FAILED: "unavailable",
    E_FIELD_MISSING: "invalid_message",
    E_INTERNAL_SERVER_ERROR: "unavailable",
    E_RATE_LIMIT_EXCEEDED: "rate_limited",
    E_RECIPIENT_NOT_ALLOWED: "rejected",
    E_RECIPIENT_SUPPRESSED: "rejected",
    E_SENDER_DOMAIN_NOT_AVAILABLE: "rejected",
    E_SENDER_NOT_VERIFIED: "rejected",
    E_TOO_MANY_RECIPIENTS: "invalid_message",
    E_VALIDATION_ERROR: "invalid_message",
    E_SOMETHING_NEW: "unavailable",
  };
  for (const [code, reason] of Object.entries(expected)) {
    const reports = [];
    const sender = createCloudflareEmailSender({
      binding: failing(code),
      from: "cms@example.com",
      report: (entry) => reports.push(entry),
      timeoutMs: 1_000,
    });
    expect(await sender.send(message)).toEqual({ reason, status: "failed" });
    expect(reports).toEqual([{ component: "email", provider: "cloudflare", reason }]);
  }
});

test("bounds a hanging binding call", async () => {
  const sender = createCloudflareEmailSender({
    binding: { send: () => new Promise(() => undefined) },
    from: "cms@example.com",
    report: () => undefined,
    timeoutMs: 5,
  });
  expect(await sender.send(message)).toEqual({ reason: "unavailable", status: "failed" });
});

function issues(env) {
  try {
    parseCloudflareSettings(env);
  } catch (error) {
    return error.issues.map((issue) => `${issue.reason}:${issue.variable}`);
  }
  return [];
}

test("settings compose email providers and require the EMAIL binding for cloudflare", () => {
  expect(parseCloudflareSettings(base).email).toEqual({ provider: "none" });
  const cloudflare = {
    ...base,
    LACE_EMAIL_FROM: "cms@example.com",
    LACE_EMAIL_PROVIDER: "cloudflare",
  };
  expect(issues(cloudflare)).toEqual(["missing:EMAIL"]);
  expect(issues({ ...cloudflare, EMAIL: { sendMail() {} } })).toEqual(["invalid:EMAIL"]);
  const binding = { send: async () => undefined };
  const parsed = parseCloudflareSettings({ ...cloudflare, EMAIL: binding });
  expect(parsed.email.provider).toBe("cloudflare");
  expect(parsed.emailBinding).toBe(binding);
  expect(parseCloudflareSettings({ ...base, EMAIL: binding })).not.toHaveProperty("emailBinding");
  expect(
    issues({ ...base, LACE_EMAIL_FROM: "cms@example.com", LACE_EMAIL_PROVIDER: "smtp" }),
  ).toEqual(["invalid:LACE_EMAIL_PROVIDER"]);
  expect(
    issues({ ...base, LACE_EMAIL_FROM: "cms@example.com", LACE_EMAIL_PROVIDER: "log" }),
  ).toEqual(["invalid:LACE_EMAIL_PROVIDER"]);
  expect(
    parseCloudflareSettings({
      ...base,
      LACE_EMAIL_FROM: "cms@example.com",
      LACE_EMAIL_PROVIDER: "log",
      LACE_ENVIRONMENT: "development",
    }).email.provider,
  ).toBe("log");
  const secret = "re_do_not_print_me";
  let failure;
  try {
    parseCloudflareSettings({
      ...base,
      LACE_EMAIL_FROM: "cms@example.com",
      LACE_EMAIL_PROVIDER: "resend",
      LACE_RESEND_API_BASE_URL: `http://${secret}.example`,
      LACE_RESEND_API_KEY: secret,
    });
  } catch (error) {
    failure = error;
  }
  expect(failure.message).toContain("LACE_RESEND_API_BASE_URL");
  expect(JSON.stringify({ message: failure.message, issues: failure.issues })).not.toContain(
    secret,
  );
});
