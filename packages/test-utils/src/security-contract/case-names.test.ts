import { expect, test } from "vitest";
import { securityContractCases } from "./registry.js";

test("preserves every security contract case in order", () => {
  expect(securityContractCases.map((value) => value.name)).toEqual([
    "setup state reads only the durable completion marker without writes",
    "setup credential completes bootstrap once and is stored only as a digest",
    "unknown, expired, and foreign-email setup credentials change nothing",
    "an interrupted bootstrap resumes for the same email without a second administrator",
    "operational account pages are ordered, bounded and include global totals",
    "user management keeps one active administrator under concurrency",
    "invitations conflict with accounts and active invitations and are digest-only",
    "invitation acceptance creates exactly one account, even concurrently",
    "resend rotates the link and revoked or accepted invitations stay closed",
    "direct creation immediately persists an active normalized user and a first reset verifier",
    "direct creation respects active invitations and preserves expired or revoked records",
    "competing direct creates and invitation writes cannot claim the same address twice",
    "a failed dependent write rolls back direct creation",
    "direct creation reuses password reset expiry, replacement and one-time consumption",
    "administrator guard excludes direct-created users until they have a password",
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
