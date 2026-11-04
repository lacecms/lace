import type {
  ManagedUser,
  SecurityRole,
  SecurityService,
  SensitiveRateLimiter,
} from "@lacecms/application";

import { unixMilliseconds } from "@lacecms/domain";
import type { ExpectStatic } from "vitest";
import type { ContractSql } from "../repository-contract/shared.js";

export interface SecurityContractHarness {
  limiter(secret: string): SensitiveRateLimiter;
  readonly security: SecurityService;
  reopenSecurity(): Promise<SecurityService>;
  setNow(value: number): void;
  readonly sql: ContractSql;
}

export interface SecurityContractRuntime {
  open(): Promise<SecurityContractHarness>;
}

export interface SecurityContractCase {
  readonly name: string;
  run(runtime: SecurityContractRuntime, expect: ExpectStatic): Promise<void>;
}

export const SECURITY_CONTRACT_EPOCH = 1_800_000_000_000;

export const password = "correct horse battery staple";

export const hour = 60 * 60 * 1000;

export async function bootstrapped(harness: SecurityContractHarness) {
  const setup = await harness.security.createSetupToken();
  const { user } = await harness.security.bootstrap({
    email: "Admin@Lace.test",
    password,
    token: setup.token,
  });
  return { setup, user };
}

export async function createUserByInvitation(
  security: SecurityService,
  input: {
    readonly email: string;
    readonly invitedBy: string;
    readonly now?: number;
    readonly password: string;
    readonly role: SecurityRole;
  },
): Promise<ManagedUser> {
  const now = unixMilliseconds(input.now ?? SECURITY_CONTRACT_EPOCH);
  const created = await security.createInvitation({
    email: input.email,
    invitedBy: input.invitedBy,
    now,
    role: input.role,
  });
  if (created.status !== "created")
    throw new Error(`Invitation was not created: ${created.status}.`);
  const accepted = await security.acceptInvitation({
    now,
    password: input.password,
    token: created.token,
  });
  if (accepted.status !== "accepted")
    throw new Error(`Invitation was not accepted: ${accepted.status}.`);
  return accepted.user;
}

export async function passwordMatches(
  security: SecurityService,
  userId: string,
  candidate: string,
): Promise<boolean> {
  const result = await security.changePassword({
    currentPassword: candidate,
    newPassword: candidate,
    now: unixMilliseconds(SECURITY_CONTRACT_EPOCH),
    userId,
  });
  return result.status === "changed";
}

export async function insertSession(
  harness: SecurityContractHarness,
  input: {
    readonly id: string;
    readonly userId: string;
    readonly expiresAt?: number;
    readonly updatedAt?: number;
  },
) {
  await harness.sql.run(
    "insert into session (id, expires_at, token, created_at, updated_at, ip_address, user_agent, user_id) values (?, ?, ?, ?, ?, '203.0.113.9', 'Mozilla/5.0 (X11; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0', ?)",
    input.id,
    input.expiresAt ?? SECURITY_CONTRACT_EPOCH + 7 * 24 * hour,
    `token-${input.id}`,
    SECURITY_CONTRACT_EPOCH,
    input.updatedAt ?? SECURITY_CONTRACT_EPOCH,
    input.userId,
  );
}

export async function sessionIds(
  harness: SecurityContractHarness,
  userId: string,
): Promise<string[]> {
  const rows = await harness.sql.all<{ id: string }>(
    "select id from session where user_id = ? order by id",
    userId,
  );
  return rows.map((row) => row.id);
}

export function outcome(result: PromiseSettledResult<unknown>): string {
  if (result.status === "fulfilled") return "fulfilled";
  const reason = result.reason as { readonly code?: unknown };
  return typeof reason?.code === "string" ? reason.code : "rejected";
}
