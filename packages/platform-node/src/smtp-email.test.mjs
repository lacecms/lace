import { createServer } from "node:net";
import { afterEach, expect, test } from "vitest";
import { createSmtpEmailSender } from "../dist/index.js";

const from = "Lace <cms@example.com>";
const message = { subject: "Hello", text: "Body", to: "ada@example.com" };
const servers = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise((done) => server.close(done))));
});

/**
 * A minimal scripted SMTP server: `extensions` are advertised after EHLO and
 * `reply` may override the answer to any command.
 */
async function smtpServer({ extensions = [], greet = true, reply = () => undefined } = {}) {
  const received = { commands: [], data: "" };
  const server = createServer((socket) => {
    let buffer = "";
    let inData = false;
    const send = (line) => socket.write(`${line}\r\n`);
    if (greet) send("220 test.local ESMTP");
    socket.on("data", (chunk) => {
      buffer += chunk.toString("utf8");
      let index;
      while ((index = buffer.indexOf("\r\n")) >= 0) {
        const line = buffer.slice(0, index);
        buffer = buffer.slice(index + 2);
        if (inData) {
          if (line === ".") {
            inData = false;
            send(reply("DATA_END") ?? "250 queued");
          } else received.data += `${line}\n`;
          continue;
        }
        received.commands.push(line);
        const verb = line.split(/[ :]/u)[0].toUpperCase();
        const custom = reply(verb, line);
        if (custom !== undefined) {
          send(custom);
          continue;
        }
        if (verb === "EHLO")
          send(
            ["250-test.local", ...extensions.map((e) => `250-${e}`), "250 8BITMIME"].join("\r\n"),
          );
        else if (verb === "DATA") {
          inData = true;
          send("354 go ahead");
        } else if (verb === "QUIT") {
          send("221 bye");
          socket.end();
        } else send("250 ok");
      }
    });
    socket.on("error", () => undefined);
  });
  servers.push(server);
  await new Promise((done) => server.listen(0, "127.0.0.1", done));
  return { port: server.address().port, received };
}

function sender(port, overrides = {}, reports = []) {
  return createSmtpEmailSender({
    from,
    report: (entry) => reports.push(entry),
    settings: { host: "127.0.0.1", port, security: "none", ...overrides },
    timeoutMs: 1_000,
  });
}

test("delivers plain SMTP when security is none", async () => {
  const server = await smtpServer();
  expect(await sender(server.port).send(message)).toEqual({ status: "sent" });
  expect(server.received.commands).toContain("MAIL FROM:<cms@example.com>");
  expect(server.received.commands).toContain("RCPT TO:<ada@example.com>");
  expect(server.received.data).toContain("Subject: Hello");
  expect(server.received.data).toContain("Body");
});

test("starttls refuses a server that does not offer STARTTLS", async () => {
  const server = await smtpServer();
  const reports = [];
  expect(await sender(server.port, { security: "starttls" }, reports).send(message)).toEqual({
    reason: "unavailable",
    status: "failed",
  });
  expect(server.received.commands.some((line) => line.startsWith("MAIL"))).toBe(false);
  expect(server.received.data).toBe("");
  expect(reports).toEqual([{ component: "email", provider: "smtp", reason: "unavailable" }]);
});

test("maps a permanent recipient refusal to rejected", async () => {
  const server = await smtpServer({
    reply: (verb) => (verb === "RCPT" ? "550 5.1.1 mailbox unavailable" : undefined),
  });
  const reports = [];
  expect(await sender(server.port, {}, reports).send(message)).toEqual({
    reason: "rejected",
    status: "failed",
  });
  expect(JSON.stringify(reports)).not.toContain("ada@example.com");
});

test("maps authentication failures to unavailable without leaking credentials", async () => {
  const server = await smtpServer({
    extensions: ["AUTH PLAIN LOGIN"],
    reply: (verb) => (verb === "AUTH" ? "535 5.7.8 authentication failed" : undefined),
  });
  const reports = [];
  const result = await sender(
    server.port,
    { auth: { password: "hunter2-secret", user: "lace" } },
    reports,
  ).send(message);
  expect(result).toEqual({ reason: "unavailable", status: "failed" });
  expect(JSON.stringify(reports)).not.toContain("hunter2-secret");
});

test("maps a silent server to unavailable after the timeout", async () => {
  const server = await smtpServer({ greet: false });
  const silent = createSmtpEmailSender({
    from,
    report: () => undefined,
    settings: { host: "127.0.0.1", port: server.port, security: "none" },
    timeoutMs: 50,
  });
  expect(await silent.send(message)).toEqual({ reason: "unavailable", status: "failed" });
});

test("implicit TLS does not fall back to plaintext", async () => {
  const server = await smtpServer();
  expect(await sender(server.port, { security: "tls" }).send(message)).toEqual({
    reason: "unavailable",
    status: "failed",
  });
  expect(server.received.commands).toEqual([]);
});
