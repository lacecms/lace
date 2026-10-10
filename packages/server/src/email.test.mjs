import { describe, expect, test, vi } from "vitest";
import {
  createEmailSender,
  createLogEmailSender,
  createResendEmailSender,
  emailDeliveryStatus,
  parseEmailSettings,
} from "../dist/index.js";

const node = { production: true, runtime: "node" };
const worker = { production: true, runtime: "cloudflare" };
const dev = { production: false, runtime: "node" };
const from = "Lace <cms@example.com>";
const message = { subject: "Hello", text: "Body", to: "ada@example.com" };

function variables(result) {
  return result.issues.map((issue) => `${issue.reason}:${issue.variable}`);
}

describe("parseEmailSettings", () => {
  test("defaults to no provider on both runtimes", () => {
    for (const options of [node, worker])
      expect(parseEmailSettings({}, options)).toEqual({
        issues: [],
        settings: { provider: "none" },
      });
    expect(parseEmailSettings({ LACE_EMAIL_PROVIDER: "  " }, node).settings).toEqual({
      provider: "none",
    });
  });

  test("requires a valid sender for every real provider", () => {
    expect(variables(parseEmailSettings({ LACE_EMAIL_PROVIDER: "log" }, dev))).toEqual([
      "missing:LACE_EMAIL_FROM",
    ]);
    expect(
      variables(
        parseEmailSettings({ LACE_EMAIL_FROM: "not an address", LACE_EMAIL_PROVIDER: "log" }, dev),
      ),
    ).toEqual(["invalid:LACE_EMAIL_FROM"]);
  });

  test("restricts providers to their runtime and log to development", () => {
    const smtp = { LACE_EMAIL_FROM: from, LACE_EMAIL_PROVIDER: "smtp", LACE_SMTP_HOST: "mail" };
    expect(variables(parseEmailSettings(smtp, worker))).toEqual(["invalid:LACE_EMAIL_PROVIDER"]);
    expect(
      variables(
        parseEmailSettings({ LACE_EMAIL_FROM: from, LACE_EMAIL_PROVIDER: "cloudflare" }, node),
      ),
    ).toEqual(["invalid:LACE_EMAIL_PROVIDER"]);
    expect(
      variables(parseEmailSettings({ LACE_EMAIL_FROM: from, LACE_EMAIL_PROVIDER: "log" }, node)),
    ).toEqual(["invalid:LACE_EMAIL_PROVIDER"]);
    expect(
      variables(
        parseEmailSettings({ LACE_EMAIL_FROM: from, LACE_EMAIL_PROVIDER: "sendgrid" }, dev),
      ),
    ).toEqual(["invalid:LACE_EMAIL_PROVIDER"]);
    expect(
      parseEmailSettings(
        { LACE_EMAIL_FROM: from, LACE_EMAIL_PROVIDER: "log" },
        { production: false, runtime: "cloudflare" },
      ).settings,
    ).toEqual({ from, provider: "log", timeoutMs: 10_000 });
    expect(
      parseEmailSettings({ LACE_EMAIL_FROM: from, LACE_EMAIL_PROVIDER: "cloudflare" }, worker)
        .settings,
    ).toEqual({ from, provider: "cloudflare", timeoutMs: 10_000 });
  });

  test("parses SMTP with secure defaults and refuses plaintext in production", () => {
    const base = { LACE_EMAIL_FROM: from, LACE_EMAIL_PROVIDER: "smtp", LACE_SMTP_HOST: "smtp.x" };
    expect(parseEmailSettings(base, node).settings).toEqual({
      from,
      provider: "smtp",
      smtp: { host: "smtp.x", port: 587, security: "starttls" },
      timeoutMs: 10_000,
    });
    expect(variables(parseEmailSettings({ ...base, LACE_SMTP_SECURITY: "none" }, node))).toEqual([
      "invalid:LACE_SMTP_SECURITY",
    ]);
    expect(
      parseEmailSettings(
        { ...base, LACE_SMTP_PORT: "1025", LACE_SMTP_SECURITY: "none", LACE_SMTP_HOST: "mailpit" },
        dev,
      ).settings.smtp,
    ).toEqual({ host: "mailpit", port: 1025, security: "none" });
    expect(
      parseEmailSettings(
        { ...base, LACE_SMTP_PASSWORD: " p@ss ", LACE_SMTP_SECURITY: "tls", LACE_SMTP_USER: "u" },
        node,
      ).settings.smtp,
    ).toEqual({
      auth: { password: " p@ss ", user: "u" },
      host: "smtp.x",
      port: 587,
      security: "tls",
    });
    expect(variables(parseEmailSettings({ ...base, LACE_SMTP_USER: "u" }, node))).toEqual([
      "missing:LACE_SMTP_PASSWORD",
    ]);
    expect(variables(parseEmailSettings({ ...base, LACE_SMTP_PASSWORD: "p" }, node))).toEqual([
      "missing:LACE_SMTP_USER",
    ]);
    expect(
      variables(parseEmailSettings({ LACE_EMAIL_FROM: from, LACE_EMAIL_PROVIDER: "smtp" }, node)),
    ).toEqual(["missing:LACE_SMTP_HOST"]);
    expect(
      variables(parseEmailSettings({ ...base, LACE_SMTP_HOST: "smtp://user@host" }, node)),
    ).toEqual(["invalid:LACE_SMTP_HOST"]);
  });

  test("rejects invalid numbers and transport values without echoing them", () => {
    const base = { LACE_EMAIL_FROM: from, LACE_EMAIL_PROVIDER: "smtp", LACE_SMTP_HOST: "smtp.x" };
    for (const [variable, value] of [
      ["LACE_SMTP_PORT", "secret-looking-value"],
      ["LACE_SMTP_PORT", "70000"],
      ["LACE_EMAIL_TIMEOUT_MS", "0"],
      ["LACE_EMAIL_TIMEOUT_MS", "60001"],
      ["LACE_SMTP_SECURITY", "ssl"],
    ]) {
      const result = parseEmailSettings({ ...base, [variable]: value }, node);
      expect(variables(result)).toEqual([`invalid:${variable}`]);
      expect(JSON.stringify(result)).not.toContain(value);
      expect(result.settings).toBeUndefined();
    }
  });

  test("parses Resend with an HTTPS-only endpoint outside development", () => {
    const base = { LACE_EMAIL_FROM: from, LACE_EMAIL_PROVIDER: "resend" };
    expect(variables(parseEmailSettings(base, worker))).toEqual(["missing:LACE_RESEND_API_KEY"]);
    const parsed = parseEmailSettings({ ...base, LACE_RESEND_API_KEY: "re_123" }, worker).settings;
    expect(parsed.resend.baseUrl.href).toBe("https://api.resend.com/");
    expect(
      variables(
        parseEmailSettings(
          { ...base, LACE_RESEND_API_BASE_URL: "http://127.0.0.1:9200", LACE_RESEND_API_KEY: "k" },
          node,
        ),
      ),
    ).toEqual(["invalid:LACE_RESEND_API_BASE_URL"]);
    expect(
      parseEmailSettings(
        { ...base, LACE_RESEND_API_BASE_URL: "http://127.0.0.1:9200", LACE_RESEND_API_KEY: "k" },
        dev,
      ).settings.resend.baseUrl.href,
    ).toBe("http://127.0.0.1:9200/");
    expect(
      variables(parseEmailSettings({ ...base, LACE_RESEND_API_KEY: "has space" }, node)),
    ).toEqual(["invalid:LACE_RESEND_API_KEY"]);
  });
});

describe("log sender", () => {
  test("writes the whole message as one record", async () => {
    const lines = [];
    const sender = createLogEmailSender({ from, write: (line) => lines.push(line) });
    expect(await sender.send(message)).toEqual({ status: "sent" });
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0])).toEqual({
      component: "email",
      from,
      provider: "log",
      subject: "Hello",
      text: "Body",
      to: "ada@example.com",
    });
  });
});

describe("resend sender", () => {
  const settings = { apiKey: "re_secret_key", baseUrl: new URL("https://api.resend.com/") };

  function sender(respond, report = () => undefined) {
    const calls = [];
    const fetch = vi.fn(async (url, init) => {
      calls.push({ init, url: String(url) });
      return respond();
    });
    return {
      calls,
      sender: createResendEmailSender({
        fetch,
        from,
        idempotencyKey: () => "key-1",
        report,
        settings,
        timeoutMs: 1_000,
      }),
    };
  }

  test("sends one authenticated JSON request", async () => {
    const { calls, sender: resend } = sender(() => new Response('{"id":"x"}', { status: 200 }));
    expect(await resend.send({ ...message, html: "<p>Body</p>" })).toEqual({ status: "sent" });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://api.resend.com/emails");
    expect(calls[0].init.method).toBe("POST");
    // Workers reject redirect: "error"; redirects are never followed.
    expect(calls[0].init.redirect).toBe("manual");
    expect(calls[0].init.headers).toMatchObject({
      authorization: "Bearer re_secret_key",
      "content-type": "application/json",
      "idempotency-key": "key-1",
    });
    expect(JSON.parse(calls[0].init.body)).toEqual({
      from,
      html: "<p>Body</p>",
      subject: "Hello",
      text: "Body",
      to: ["ada@example.com"],
    });
  });

  test("maps provider answers to closed reasons and logs only sanitized evidence", async () => {
    for (const [status, reason] of [
      [422, "rejected"],
      [403, "rejected"],
      [401, "rejected"],
      [429, "rate_limited"],
      [500, "unavailable"],
      [503, "unavailable"],
      [302, "unavailable"],
    ]) {
      const reports = [];
      const { sender: resend } = sender(
        () => new Response('{"message":"The ada@example.com domain is not verified"}', { status }),
        (entry) => reports.push(entry),
      );
      expect(await resend.send(message)).toEqual({ reason, status: "failed" });
      expect(reports).toEqual([{ component: "email", provider: "resend", reason }]);
      expect(JSON.stringify(reports)).not.toMatch(/ada@example|re_secret_key|verified/u);
    }
  });

  test("maps network failures and timeouts to unavailable", async () => {
    const { sender: network } = sender(() => {
      throw new TypeError("fetch failed: getaddrinfo ENOTFOUND api.resend.com");
    });
    expect(await network.send(message)).toEqual({ reason: "unavailable", status: "failed" });
    const timeout = createResendEmailSender({
      fetch: (_url, init) =>
        new Promise((_resolve, reject) =>
          init.signal.addEventListener("abort", () => reject(init.signal.reason)),
        ),
      from,
      report: () => undefined,
      settings,
      timeoutMs: 5,
    });
    expect(await timeout.send(message)).toEqual({ reason: "unavailable", status: "failed" });
  });
});

describe("createEmailSender", () => {
  test("composes runtime-neutral senders and delegates runtime providers", async () => {
    const none = createEmailSender({ provider: "none" });
    expect(emailDeliveryStatus(none)).toEqual({ provider: "none" });
    expect(await none.send(message)).toEqual({ reason: "not_configured", status: "failed" });
    const log = createEmailSender({ from, provider: "log", timeoutMs: 1 }, { write: () => {} });
    expect(emailDeliveryStatus(log)).toEqual({ from, provider: "log" });
    const runtimeSender = vi.fn(() => ({ from, provider: "smtp", send: async () => ({}) }));
    const smtp = createEmailSender(
      { from, provider: "smtp", smtp: { host: "h", port: 1, security: "tls" }, timeoutMs: 1 },
      { runtimeSender },
    );
    expect(smtp.provider).toBe("smtp");
    expect(runtimeSender).toHaveBeenCalledOnce();
    expect(() => createEmailSender({ from, provider: "cloudflare", timeoutMs: 1 })).toThrow();
  });
});
