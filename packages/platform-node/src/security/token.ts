import {
  BUILD_TOKEN_CAPABILITIES_JSON,
  BUILD_TOKEN_KIND_SQL,
  IMPORT_TOKEN_KIND_SQL,
  IMPORT_TOKEN_RECORD_USE_SQL,
  IMPORT_TOKEN_SELECT_SQL,
  buildTokenMetadata,
  importTokenCapabilitiesJson,
  importTokenMetadata,
  importTokenRowActive,
} from "@lacecms/db";
import { randomBytes, timingSafeEqual } from "node:crypto";
import {
  IMPORT_TOKEN_USE_RECORD_INTERVAL_MS,
  SETUP_TOKEN_TTL_MS,
  type BuildTokenMetadata,
  type ImportTokenCapabilities,
  type ImportTokenMetadata,
  type IssuedBuildToken,
  type IssuedImportToken,
  type OpaqueTokenSecret,
  type ResolvedImportToken,
  type TokenSecurityPort,
} from "@lacecms/application";
import { AccountError, unixMilliseconds, type UnixMilliseconds } from "@lacecms/domain";
import type Database from "better-sqlite3";
import { digest, tokenSecret } from "./secrets.js";

/** SQLite setup, build and import token issuance, verification and revocation. */
export class NodeTokenSecurity implements TokenSecurityPort {
  public constructor(
    private readonly connection: Database.Database,
    private readonly now: () => UnixMilliseconds,
  ) {}

  public async createSetupToken(): Promise<{
    readonly expiresAt: UnixMilliseconds;
    readonly token: OpaqueTokenSecret;
  }> {
    const now = this.now();
    const token = tokenSecret();
    this.connection.transaction(() => {
      const state = this.connection
        .prepare("select setup_completed_at from installation_state where singleton_key = 1")
        .get() as { setup_completed_at: number | null } | undefined;
      if (state?.setup_completed_at !== null && state !== undefined)
        throw new AccountError("NOT_FOUND");
      this.connection
        .prepare("insert or ignore into installation_state (singleton_key) values (1)")
        .run();
      this.connection
        .prepare("insert into setup_tokens (token_hash, expires_at, created_at) values (?, ?, ?)")
        .run(digest(token), Number(now) + SETUP_TOKEN_TTL_MS, Number(now));
    })();
    return Object.freeze({ expiresAt: unixMilliseconds(Number(now) + SETUP_TOKEN_TTL_MS), token });
  }

  public async createBuildToken(input: {
    readonly name: string;
    readonly now: UnixMilliseconds;
  }): Promise<IssuedBuildToken> {
    const token = tokenSecret();
    const id = randomBytes(16).toString("hex");
    const prefix = token.slice(0, 8);
    this.connection
      .prepare(
        "insert into api_tokens (id, name, token_prefix, token_hash, capabilities_json, created_at) values (?, ?, ?, ?, ?, ?)",
      )
      .run(id, input.name, prefix, digest(token), BUILD_TOKEN_CAPABILITIES_JSON, Number(input.now));
    return Object.freeze({
      ...buildTokenMetadata(
        this.connection.prepare("select * from api_tokens where id = ?").get(id) as Record<
          string,
          unknown
        >,
      ),
      token,
    });
  }
  public async listBuildTokens(): Promise<readonly BuildTokenMetadata[]> {
    return this.connection
      .prepare(`select * from api_tokens where ${BUILD_TOKEN_KIND_SQL} order by created_at desc`)
      .all()
      .map((row) => buildTokenMetadata(row as Record<string, unknown>));
  }
  public async revokeBuildToken(input: {
    readonly tokenId: string;
    readonly now: UnixMilliseconds;
  }): Promise<BuildTokenMetadata | null> {
    this.connection
      .prepare(
        `update api_tokens set revoked_at = coalesce(revoked_at, ?) where id = ? and ${BUILD_TOKEN_KIND_SQL}`,
      )
      .run(Number(input.now), input.tokenId);
    const row = this.connection
      .prepare(`select * from api_tokens where id = ? and ${BUILD_TOKEN_KIND_SQL}`)
      .get(input.tokenId) as Record<string, unknown> | undefined;
    return row === undefined ? null : buildTokenMetadata(row);
  }
  public async verifyBuildToken(input: {
    readonly token: OpaqueTokenSecret;
    readonly now: UnixMilliseconds;
  }): Promise<boolean> {
    const candidate = Buffer.from(digest(input.token));
    const rows = this.connection
      .prepare(
        `select id, token_hash from api_tokens where revoked_at is null and ${BUILD_TOKEN_KIND_SQL}`,
      )
      .all() as { id: string; token_hash: string }[];
    const matches = rows.map((row) => ({
      row,
      equal: timingSafeEqual(Buffer.from(row.token_hash), candidate),
    }));
    const matched = matches.find((value) => value.equal)?.row;
    if (matched === undefined) return false;
    this.connection
      .prepare("update api_tokens set last_used_at = ? where id = ?")
      .run(Number(input.now), matched.id);
    return true;
  }

  private importTokenRow(tokenId: string): Record<string, unknown> | undefined {
    return this.connection
      .prepare(`${IMPORT_TOKEN_SELECT_SQL} where t.id = ? and ${IMPORT_TOKEN_KIND_SQL}`)
      .get(tokenId) as Record<string, unknown> | undefined;
  }

  public async createImportToken(input: {
    readonly capabilities: ImportTokenCapabilities;
    readonly createdBy: string;
    readonly expiresAt: UnixMilliseconds;
    readonly name: string;
    readonly now: UnixMilliseconds;
  }): Promise<IssuedImportToken> {
    const token = tokenSecret();
    const id = randomBytes(16).toString("hex");
    this.connection
      .prepare(
        "insert into api_tokens (id, name, token_prefix, token_hash, capabilities_json, created_at, expires_at, created_by) values (?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .run(
        id,
        input.name,
        token.slice(0, 8),
        digest(token),
        importTokenCapabilitiesJson(input.capabilities),
        Number(input.now),
        Number(input.expiresAt),
        input.createdBy,
      );
    return Object.freeze({ ...importTokenMetadata(this.importTokenRow(id)!), token });
  }

  public async listImportTokens(): Promise<readonly ImportTokenMetadata[]> {
    return this.connection
      .prepare(
        `${IMPORT_TOKEN_SELECT_SQL} where ${IMPORT_TOKEN_KIND_SQL} order by t.created_at desc`,
      )
      .all()
      .map((row) => importTokenMetadata(row as Record<string, unknown>));
  }

  public async revokeImportToken(input: {
    readonly tokenId: string;
    readonly now: UnixMilliseconds;
  }): Promise<ImportTokenMetadata | null> {
    this.connection
      .prepare(
        `update api_tokens set revoked_at = coalesce(revoked_at, ?) where id = ? and ${IMPORT_TOKEN_KIND_SQL}`,
      )
      .run(Number(input.now), input.tokenId);
    const row = this.importTokenRow(input.tokenId);
    return row === undefined ? null : importTokenMetadata(row);
  }

  public async resolveImportToken(input: {
    readonly token: OpaqueTokenSecret;
    readonly now: UnixMilliseconds;
  }): Promise<ResolvedImportToken | null> {
    const candidate = Buffer.from(digest(input.token));
    const rows = this.connection
      .prepare(`${IMPORT_TOKEN_SELECT_SQL} where t.revoked_at is null and ${IMPORT_TOKEN_KIND_SQL}`)
      .all() as Record<string, unknown>[];
    const matched = rows
      .map((row) => ({
        row,
        equal: timingSafeEqual(Buffer.from(String(row.token_hash)), candidate),
      }))
      .find((value) => value.equal)?.row;
    const now = Number(input.now);
    if (matched === undefined || !importTokenRowActive(matched, now)) return null;
    this.connection
      .prepare(IMPORT_TOKEN_RECORD_USE_SQL)
      .run(now, matched.id, now - IMPORT_TOKEN_USE_RECORD_INTERVAL_MS);
    return Object.freeze({
      creator: Object.freeze({
        id: String(matched.created_by),
        role: String(matched.creator_role),
      }),
      token: importTokenMetadata(this.importTokenRow(String(matched.id))!),
    });
  }
}
