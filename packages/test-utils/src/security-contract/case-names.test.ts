import { expect, test } from "vitest";
import { securityContractCases } from "./registry.js";

test("preserves every security contract case in order", () => {
  expect(securityContractCases.map((value) => value.name)).toEqual([
    "setup state reads only the durable completion marker without writes",
    "setup credential completes bootstrap once and is stored only as a digest",
    "unknown, expired, and foreign-email setup credentials change nothing",
    "an interrupted bootstrap resumes for the same email without a second administrator",
    "user management keeps one active administrator under concurrency",
    "invitations conflict with accounts and active invitations and are digest-only",
    "invitation acceptance creates exactly one account, even concurrently",
    "resend rotates the link and revoked or accepted invitations stay closed",
    "password resets expire, are superseded, and end every session",
    "password changes require the current password and can keep only one session",
    "sessions are listed per user without tokens and foreign identifiers are not found",
    "disabling a user deletes its sessions and a refused disable keeps them",
    "build credentials are digest-only, verified, and revocable",
    "import credentials expire, record throttled use and stay apart from build credentials",
    "account security events revoke only the creator's import credentials",
    "fixed-window limits count concurrent attempts and store only HMAC keys",
    "OAuth and MCP fixed windows isolate subjects and reset exactly at expiry",
  ]);
});
