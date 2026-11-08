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
import type { D1Database } from "../d1.js";
import { constantTimeEqual, digest, randomHex, tokenSecret } from "./secrets.js";
import { SETUP_COMPLETED_SQL, bindStatement } from "./statements.js";

/** D1 setup, build and import token issuance, verification and revocation. */
export class D1TokenSecurity implements TokenSecurityPort {
  public constructor(
    private readonly database: D1Database,
    private readonly now: () => UnixMilliseconds,
  ) {}

  public async createSetupToken(): Promise<{
    readonly expiresAt: UnixMilliseconds;
    readonly token: OpaqueTokenSecret;
  }> {
    const now = Number(this.now());
    const token = tokenSecret();
    const [, minted] = await this.database.batch([
      bindStatement(
        this.database,
        "insert or ignore into installation_state (singleton_key) values (1)",
      ),
      bindStatement(
        this.database,
        `insert into setup_tokens (token_hash, expires_at, created_at) select ?, ?, ? where not ${SETUP_COMPLETED_SQL}`,
        await digest(token),
        now + SETUP_TOKEN_TTL_MS,
        now,
      ),
    ]);
    if (minted?.meta.changes !== 1) throw new AccountError("NOT_FOUND");
    return Object.freeze({ expiresAt: unixMilliseconds(now + SETUP_TOKEN_TTL_MS), token });
  }

  public async createBuildToken(input: {
    readonly name: string;
    readonly now: UnixMilliseconds;
  }): Promise<IssuedBuildToken> {
    const token = tokenSecret();
    const id = randomHex(16);
    await bindStatement(
      this.database,
      "insert into api_tokens (id, name, token_prefix, token_hash, capabilities_json, created_at) values (?, ?, ?, ?, ?, ?)",
      id,
      input.name,
      token.slice(0, 8),
      await digest(token),
      BUILD_TOKEN_CAPABILITIES_JSON,
      Number(input.now),
    ).run();
    const row = await bindStatement(
      this.database,
      "select * from api_tokens where id = ?",
      id,
    ).first();
    if (row === null) throw new Error("Build token could not be reloaded.");
    return Object.freeze({ ...buildTokenMetadata(row), token });
  }

  public async listBuildTokens(): Promise<readonly BuildTokenMetadata[]> {
    const rows = await bindStatement(
      this.database,
      `select * from api_tokens where ${BUILD_TOKEN_KIND_SQL} order by created_at desc`,
    ).all();
    return rows.results.map((row) => buildTokenMetadata(row));
  }

  public async revokeBuildToken(input: {
    readonly tokenId: string;
    readonly now: UnixMilliseconds;
  }): Promise<BuildTokenMetadata | null> {
    const [, row] = await this.database.batch([
      bindStatement(
        this.database,
        `update api_tokens set revoked_at = coalesce(revoked_at, ?) where id = ? and ${BUILD_TOKEN_KIND_SQL}`,
        Number(input.now),
        input.tokenId,
      ),
      bindStatement(
        this.database,
        `select * from api_tokens where id = ? and ${BUILD_TOKEN_KIND_SQL}`,
        input.tokenId,
      ),
    ]);
    const value = row?.results[0];
    return value === undefined ? null : buildTokenMetadata(value);
  }

  public async verifyBuildToken(input: {
    readonly token: OpaqueTokenSecret;
    readonly now: UnixMilliseconds;
  }): Promise<boolean> {
    const candidate = await digest(input.token);
    const rows = await bindStatement(
      this.database,
      `select id, token_hash from api_tokens where revoked_at is null and ${BUILD_TOKEN_KIND_SQL}`,
    ).all<{ id: string; token_hash: string }>();
    let matched: string | undefined;
    for (const row of rows.results)
      if (constantTimeEqual(row.token_hash, candidate) && matched === undefined) matched = row.id;
    if (matched === undefined) return false;
    const used = await bindStatement(
      this.database,
      "update api_tokens set last_used_at = ? where id = ? and revoked_at is null",
      Number(input.now),
      matched,
    ).run();
    return used.meta.changes === 1;
  }

  public async createImportToken(input: {
    readonly capabilities: ImportTokenCapabilities;
    readonly createdBy: string;
    readonly expiresAt: UnixMilliseconds;
    readonly name: string;
    readonly now: UnixMilliseconds;
  }): Promise<IssuedImportToken> {
    const token = tokenSecret();
    const id = randomHex(16);
    const [, row] = await this.database.batch([
      bindStatement(
        this.database,
        "insert into api_tokens (id, name, token_prefix, token_hash, capabilities_json, created_at, expires_at, created_by) values (?, ?, ?, ?, ?, ?, ?, ?)",
        id,
        input.name,
        token.slice(0, 8),
        await digest(token),
        importTokenCapabilitiesJson(input.capabilities),
        Number(input.now),
        Number(input.expiresAt),
        input.createdBy,
      ),
      bindStatement(
        this.database,
        `${IMPORT_TOKEN_SELECT_SQL} where t.id = ? and ${IMPORT_TOKEN_KIND_SQL}`,
        id,
      ),
    ]);
    const value = row?.results[0];
    if (value === undefined) throw new Error("Import token could not be reloaded.");
    return Object.freeze({ ...importTokenMetadata(value), token });
  }

  public async listImportTokens(): Promise<readonly ImportTokenMetadata[]> {
    const rows = await bindStatement(
      this.database,
      `${IMPORT_TOKEN_SELECT_SQL} where ${IMPORT_TOKEN_KIND_SQL} order by t.created_at desc`,
    ).all();
    return rows.results.map((row) => importTokenMetadata(row));
  }

  public async revokeImportToken(input: {
    readonly tokenId: string;
    readonly now: UnixMilliseconds;
  }): Promise<ImportTokenMetadata | null> {
    const [, row] = await this.database.batch([
      bindStatement(
        this.database,
        `update api_tokens set revoked_at = coalesce(revoked_at, ?) where id = ? and ${IMPORT_TOKEN_KIND_SQL}`,
        Number(input.now),
        input.tokenId,
      ),
      bindStatement(
        this.database,
        `${IMPORT_TOKEN_SELECT_SQL} where t.id = ? and ${IMPORT_TOKEN_KIND_SQL}`,
        input.tokenId,
      ),
    ]);
    const value = row?.results[0];
    return value === undefined ? null : importTokenMetadata(value);
  }

  public async resolveImportToken(input: {
    readonly token: OpaqueTokenSecret;
    readonly now: UnixMilliseconds;
  }): Promise<ResolvedImportToken | null> {
    const candidate = await digest(input.token);
    const rows = await bindStatement(
      this.database,
      `${IMPORT_TOKEN_SELECT_SQL} where t.revoked_at is null and ${IMPORT_TOKEN_KIND_SQL}`,
    ).all();
    let matched: Record<string, unknown> | undefined;
    for (const row of rows.results)
      if (constantTimeEqual(String(row.token_hash), candidate) && matched === undefined)
        matched = row;
    const now = Number(input.now);
    if (matched === undefined || !importTokenRowActive(matched, now)) return null;
    const [, row] = await this.database.batch([
      bindStatement(
        this.database,
        IMPORT_TOKEN_RECORD_USE_SQL,
        now,
        matched.id,
        now - IMPORT_TOKEN_USE_RECORD_INTERVAL_MS,
      ),
      bindStatement(this.database, `${IMPORT_TOKEN_SELECT_SQL} where t.id = ?`, matched.id),
    ]);
    const value = row?.results[0];
    if (value === undefined) return null;
    return Object.freeze({
      creator: Object.freeze({
        id: String(matched.created_by),
        role: String(matched.creator_role),
      }),
      token: importTokenMetadata(value),
    });
  }
}
