import { adminSessionSchema, type AdminSessionDto, type PermissionDto } from "@lacecms/contracts";
import * as v from "valibot";

export type AdminRole = "admin" | "editor" | "viewer";
export type AdminPermission = PermissionDto;

export interface AdminSession {
  /** Presentation-only name for the shell; never used for route policy. */
  readonly displayName?: string;
  readonly email: string;
  readonly id: string;
  /** Server-derived grants; the only input to authorization affordances. */
  readonly permissions: ReadonlySet<AdminPermission>;
  /** Presentation only: labels and badges, never access decisions. */
  readonly role: AdminRole;
}

export interface AdminSessionSource {
  get(): Promise<AdminSession | null>;
  invalidate(): void;
}

/** Whether the signed-in user holds a permission; the single admin policy check. */
export function can(session: Pick<AdminSession, "permissions">, permission: AdminPermission) {
  return session.permissions.has(permission);
}

function nonEmpty(value: string | undefined): string | undefined {
  return value !== undefined && value.trim().length > 0 ? value.trim() : undefined;
}

/** Converts the validated session summary into the admin's session value. */
export function adminSessionFromDto(dto: AdminSessionDto): AdminSession {
  const displayName = nonEmpty(dto.user.displayName) ?? dto.user.email;
  return Object.freeze({
    displayName,
    email: dto.user.email,
    id: dto.user.id,
    permissions: new Set(dto.permissions),
    role: dto.user.role,
  });
}

function parseSession(value: unknown): AdminSession | null {
  const result = v.safeParse(adminSessionSchema, value);
  return result.success ? adminSessionFromDto(result.output) : null;
}

/** Reads identity and server-derived permissions from the same-origin session summary. */
export function createBrowserSessionSource(fetcher: typeof fetch = fetch): AdminSessionSource {
  let pending: Promise<AdminSession | null> | undefined;
  return Object.freeze({
    get: () => {
      pending ??= fetcher("/api/v1/admin/session", {
        credentials: "same-origin",
        headers: { accept: "application/json" },
      })
        .then(async (response) => (response.ok ? parseSession(await response.json()) : null))
        .catch(() => null);
      return pending;
    },
    invalidate: () => {
      pending = undefined;
    },
  });
}

export function createStaticSessionSource(session: AdminSession | null): AdminSessionSource {
  return Object.freeze({ get: async () => session, invalidate: () => undefined });
}
