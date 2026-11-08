// @ts-nocheck
// TODO(rf2): Type mutable transport fixtures and deliberately malformed metadata.
import * as v from "valibot";
import { expect, test } from "vitest";
import { adminSettingsStatusSchema, emailTestResultSchema } from "./status.js";

test("operational status requires a bounded engine release", () => {
  const status = {
    configuredModels: 2,
    mcp: { enabled: false, endpoint: "https://lace.test/mcp" },
    email: { provider: "none" },
    engineVersion: "0.1.0-alpha.4",
    ready: false,
  };
  expect(v.parse(adminSettingsStatusSchema, status)).toEqual(status);
  for (const engineVersion of [undefined, "", "x".repeat(121), 4])
    expect(v.safeParse(adminSettingsStatusSchema, { ...status, engineVersion }).success).toBe(
      false,
    );
});

test("operational status reports email delivery without provider settings", () => {
  const status = {
    configuredModels: 0,
    mcp: { enabled: false, endpoint: "https://lace.test/mcp" },
    engineVersion: "0.1.0-alpha.4",
    ready: true,
  };
  const parse = (email) => v.safeParse(adminSettingsStatusSchema, { ...status, email }).success;
  expect(parse({ provider: "none" })).toBe(true);
  expect(parse({ from: "Lace <cms@example.com>", provider: "smtp" })).toBe(true);
  expect(parse({ from: "cms@example.com", provider: "none" })).toBe(false);
  expect(parse({ provider: "resend" })).toBe(false);
  expect(parse({ from: "cms@example.com", host: "smtp.example.com", provider: "smtp" })).toBe(
    false,
  );
  expect(parse({ from: "cms@example.com", provider: "sendgrid" })).toBe(false);
  expect(parse(undefined)).toBe(false);
});

test("email test results use closed outcomes", () => {
  const parse = (value) => v.safeParse(emailTestResultSchema, value).success;
  expect(parse({ status: "sent" })).toBe(true);
  for (const reason of [
    "not_configured",
    "invalid_message",
    "rejected",
    "rate_limited",
    "unavailable",
  ])
    expect(parse({ reason, status: "failed" })).toBe(true);
  expect(parse({ reason: "smtp 550 mailbox unavailable", status: "failed" })).toBe(false);
  expect(parse({ detail: "provider text", status: "sent" })).toBe(false);
});

test("MCP settings summary is strict and uses a canonical HTTP endpoint", () => {
  const status = {
    configuredModels: 0,
    email: { provider: "none" },
    engineVersion: "test",
    ready: true,
  };
  const parse = (mcp) => v.safeParse(adminSettingsStatusSchema, { ...status, mcp }).success;
  for (const enabled of [true, false]) {
    expect(parse({ enabled, endpoint: "http://127.0.0.1:54321/mcp" })).toBe(true);
    expect(parse({ enabled, endpoint: "https://cms.example.com/mcp" })).toBe(true);
  }
  for (const endpoint of [
    "/mcp",
    "file:///mcp",
    "https://user:pass@cms.test/mcp",
    "https://cms.test/mcp?token=secret",
    "https://cms.test/mcp#x",
    "https://cms.test/mcp/",
    "https://cms.test/api",
    "invalid",
  ]) {
    expect(parse({ enabled: true, endpoint })).toBe(false);
  }
  for (const mcp of [
    undefined,
    { enabled: "true", endpoint: "https://cms.test/mcp" },
    { enabled: true },
    { enabled: true, endpoint: "https://cms.test/mcp", token: "secret" },
  ])
    expect(parse(mcp)).toBe(false);
});
