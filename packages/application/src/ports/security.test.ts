import { expect, test } from "vitest";
import { SETUP_TOKEN_TTL_MS } from "../accounts/use-cases.js";
import { SENSITIVE_RATE_LIMIT_POLICIES } from "./security.js";

const minute = 60_000;
const hour = 60 * minute;

test("pins every sensitive rate-limit policy", () => {
  expect(SENSITIVE_RATE_LIMIT_POLICIES).toEqual({
    auth: { limit: 10, windowMs: 15 * minute },
    email: { limit: 5, windowMs: hour },
    invite: { limit: 20, windowMs: hour },
    mcp: { limit: 60, windowMs: minute },
    "oauth-register": { limit: 10, windowMs: 15 * minute },
    "oauth-revoke": { limit: 20, windowMs: hour },
    "oauth-token": { limit: 60, windowMs: minute },
    reset: { limit: 3, windowMs: hour },
    setup: { limit: 5, windowMs: hour },
    token: { limit: 20, windowMs: hour },
    upload: { limit: 30, windowMs: minute },
  });
});

test("freezes the policy table and each policy", () => {
  expect(Object.isFrozen(SENSITIVE_RATE_LIMIT_POLICIES)).toBe(true);
  for (const policy of Object.values(SENSITIVE_RATE_LIMIT_POLICIES))
    expect(Object.isFrozen(policy)).toBe(true);
});

test("setup tokens expire one hour after they are minted", () => {
  expect(SETUP_TOKEN_TTL_MS).toBe(hour);
});
