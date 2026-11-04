import { unixMilliseconds } from "@lacecms/domain";
import type { ImportTokenCapabilities, ImportTokenMetadata } from "@lacecms/application";

/**
 * Build and import tokens share `api_tokens`; every query selects one kind by
 * its stored capability list, so neither kind can authenticate the other's
 * surface (ADR 0016).
 */
export const BUILD_TOKEN_CAPABILITIES_JSON = '["content:build:read"]';
export const BUILD_TOKEN_KIND_SQL = `capabilities_json = '${BUILD_TOKEN_CAPABILITIES_JSON}'`;
export const IMPORT_TOKEN_KIND_SQL = `capabilities_json like '["content:import"%'`;

/**
 * Revokes every unrevoked import token created by the users the predicate
 * selects. Parameters follow `oauthUserInvalidationSql`: the revocation time,
 * then the predicate's values, so both statements share one argument list.
 */
export function importTokenUserInvalidationSql(predicate = "id = ?"): string {
  return `update api_tokens set revoked_at = ?
    where revoked_at is null and ${IMPORT_TOKEN_KIND_SQL}
    and created_by in (select id from user where ${predicate})`;
}

/** Import-token rows with their creator; filter with `IMPORT_TOKEN_KIND_SQL`. */
export const IMPORT_TOKEN_SELECT_SQL = `select t.id, t.name, t.token_prefix, t.token_hash,
  t.capabilities_json, t.created_at, t.expires_at, t.last_used_at, t.revoked_at, t.created_by,
  u.email as creator_email, u.name as creator_name, u.role as creator_role,
  u.disabled as creator_disabled
  from api_tokens t left join user u on u.id = t.created_by`;

/** Records a use only when none was recorded within the throttle interval. */
export const IMPORT_TOKEN_RECORD_USE_SQL = `update api_tokens set last_used_at = ?
  where id = ? and (last_used_at is null or last_used_at <= ?)`;

function importCapabilities(value: unknown): ImportTokenCapabilities {
  if (value === '["content:import"]') return ["content:import"];
  if (value === '["content:import","content:publish"]')
    return ["content:import", "content:publish"];
  throw new TypeError("Invalid import token capabilities.");
}

export function importTokenCapabilitiesJson(capabilities: ImportTokenCapabilities): string {
  return JSON.stringify(capabilities);
}

/** Maps an `IMPORT_TOKEN_SELECT_SQL` row; never exposes the verifier. */
export function importTokenMetadata(row: Record<string, unknown>): ImportTokenMetadata {
  const displayName = typeof row.creator_name === "string" ? row.creator_name.trim() : "";
  return Object.freeze({
    capabilities: importCapabilities(row.capabilities_json),
    createdAt: unixMilliseconds(Number(row.created_at)),
    createdBy: Object.freeze({
      ...(displayName === "" ? {} : { displayName }),
      email: typeof row.creator_email === "string" ? row.creator_email : "",
      id: String(row.created_by),
    }),
    expiresAt: unixMilliseconds(Number(row.expires_at)),
    id: String(row.id),
    ...(row.last_used_at === null
      ? {}
      : { lastUsedAt: unixMilliseconds(Number(row.last_used_at)) }),
    name: String(row.name),
    ...(row.revoked_at === null ? {} : { revokedAt: unixMilliseconds(Number(row.revoked_at)) }),
    tokenPrefix: String(row.token_prefix),
  });
}

/** Whether a mapped row may authenticate at `now`: unrevoked, unexpired, enabled creator. */
export function importTokenRowActive(row: Record<string, unknown>, now: number): boolean {
  return (
    row.revoked_at === null &&
    Number(row.expires_at) > now &&
    typeof row.creator_role === "string" &&
    Number(row.creator_disabled) === 0
  );
}
