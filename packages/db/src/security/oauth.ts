import type {
  OAuthAuthority,
  OAuthConnection,
  OAuthGrant,
  OAuthIssuance,
  OAuthIssuancePersistence,
  OAuthPreparedToken,
} from "@lacecms/application";

export interface OAuthSqlStatement {
  readonly sql: string;
  readonly values: readonly (string | number | null)[];
}
/** The batch is one atomic transaction on SQLite, one guarded batch on D1. */
export interface OAuthSqlDriver {
  rows(
    sql: string,
    values: readonly (string | number | null)[],
  ): Promise<Record<string, unknown>[]>;
  batch(statements: readonly OAuthSqlStatement[]): Promise<readonly number[]>;
}
/** Trusted repository predicates only; values are always bound by the adapter. */
export function oauthUserInvalidationSql(predicate = "id = ?"): string {
  return `insert into oauth_user_authority(user_id,generation,updated_at)
    select id,1,? from user where ${predicate}
    on conflict(user_id) do update set generation=generation+1,updated_at=excluded.updated_at`;
}

const statement = (sql: string, ...values: (string | number | null)[]): OAuthSqlStatement => ({
  sql,
  values,
});
const ACTIVE = `g.revoked_at is null and g.expires_at > ? and u.disabled = 0
  and u.role in ('admin','editor','viewer')
  and g.user_generation = coalesce(a.generation, 0) and coalesce(a.invalidation_pending, 0) = 0`;
const ACCOUNT_JOINS = `join user u on u.id = g.user_id
  left join oauth_user_authority a on a.user_id = g.user_id`;
const GRANT_JOINS = `oauth_grants g ${ACCOUNT_JOINS}`;
const ATTEMPT_ACTIVE = `exists (select 1 from oauth_issuances i join oauth_grants g on g.id = i.grant_id ${ACCOUNT_JOINS}
  where i.id = ? and i.state = 'pending' and i.pending_expires_at > ?
  and i.family_generation = g.generation and i.user_generation = coalesce(a.generation, 0) and ${ACTIVE})`;
function string(row: Record<string, unknown>, key: string): string {
  if (typeof row[key] !== "string") throw new Error("OAuth persistence unavailable.");
  return row[key];
}
function grantRow(row: Record<string, unknown>): OAuthGrant {
  const scopes: unknown = JSON.parse(string(row, "scopes_json"));
  if (!Array.isArray(scopes) || !scopes.every((scope) => typeof scope === "string"))
    throw new Error("OAuth persistence unavailable.");
  return Object.freeze({
    id: string(row, "id"),
    userId: string(row, "user_id"),
    clientId: string(row, "client_id"),
    resource: string(row, "resource"),
    scopes: Object.freeze(scopes as string[]),
    generation: Number(row.generation),
    userGeneration: Number(row.user_generation),
    createdAt: Number(row.created_at),
    expiresAt: Number(row.expires_at),
    revokedAt: row.revoked_at === null ? null : Number(row.revoked_at),
  });
}
export class SqlOAuthIssuancePersistence implements OAuthIssuancePersistence {
  public constructor(private readonly driver: OAuthSqlDriver) {}
  public async userGeneration(userId: string): Promise<number | null> {
    const [row] = await this.driver.rows(
      `select coalesce(a.generation,0) as generation from user u
      left join oauth_user_authority a on a.user_id=u.id where u.id=? and u.disabled=0
      and u.role in ('admin','editor','viewer') and coalesce(a.invalidation_pending,0)=0`,
      [userId],
    );
    return row ? Number(row.generation) : null;
  }
  public async createGrant(input: Omit<OAuthGrant, "generation" | "revokedAt">): Promise<boolean> {
    const result = await this.driver.batch([
      statement(
        `insert into oauth_grants
      (id,user_id,client_id,resource,scopes_json,user_generation,created_at,expires_at)
      select ?,u.id,?,?,?,?,?,? from user u left join oauth_user_authority a on a.user_id=u.id
      join oauth_clients c on c.client_id=? where u.id=? and u.disabled=0
      and coalesce(c.disabled,0)=0 and coalesce(a.generation,0)=? and coalesce(a.invalidation_pending,0)=0`,
        input.id,
        input.clientId,
        input.resource,
        JSON.stringify(input.scopes),
        input.userGeneration,
        input.createdAt,
        input.expiresAt,
        input.clientId,
        input.userId,
        input.userGeneration,
      ),
    ]);
    return result[0] === 1;
  }
  public async grant(id: string, now: number): Promise<OAuthGrant | null> {
    const [row] = await this.driver.rows(
      `select g.* from ${GRANT_JOINS} where g.id=? and ${ACTIVE}`,
      [id, now],
    );
    return row ? grantRow(row) : null;
  }
  public async claim(
    input: Parameters<OAuthIssuancePersistence["claim"]>[0],
  ): Promise<OAuthIssuance | null> {
    const code = input.kind === "code";
    const source = code
      ? "verification p"
      : "oauth_refresh_tokens p join oauth_token_bindings b on b.provider_id=p.id and b.kind='refresh' join oauth_issuances parent on parent.id=b.issuance_id";
    const sourceGuard = code
      ? "p.identifier=? and json_extract(p.value,'$.referenceId')=g.id"
      : "p.token=? and p.revoked is null and b.grant_id=g.id and b.family_generation=g.generation and b.user_generation=coalesce(a.generation,0) and parent.state='committed'";
    const changes = await this.driver.batch([
      statement(
        `insert into oauth_issuances
        (id,grant_id,kind,input_hash,parent_provider_id,family_generation,user_generation,created_at,pending_expires_at,retain_until)
        select ?,g.id,?,?,p.id,g.generation,coalesce(a.generation,0),?,min(?+60000,g.expires_at),g.expires_at
        from ${source} join oauth_grants g on g.id=? ${ACCOUNT_JOINS} where p.id=? and ${sourceGuard}
        and p.expires_at>? and g.client_id=? and ${ACTIVE}
        on conflict(kind,input_hash) do nothing`,
        input.id,
        input.kind,
        input.inputHash,
        input.now,
        input.now,
        input.grantId,
        input.providerId,
        input.inputHash,
        input.now,
        input.clientId,
        input.now,
      ),
      code
        ? statement(
            `delete from verification where id=? and exists
        (select 1 from oauth_issuances where id=? and state='pending')`,
            input.providerId,
            input.id,
          )
        : statement(
            `update oauth_refresh_tokens set revoked=?,rotated_at=? where id=? and revoked is null
        and exists (select 1 from oauth_issuances where id=? and state='pending')`,
            input.now,
            input.now,
            input.providerId,
            input.id,
          ),
    ]);
    if (changes[0] !== 1 || changes[1] !== 1) {
      if (!code) await this.revokeReplay(input.inputHash, input.clientId, input.now);
      return null;
    }
    const [row] = await this.driver.rows("select * from oauth_issuances where id=?", [input.id]);
    if (!row) throw new Error("OAuth persistence unavailable.");
    return Object.freeze({
      id: input.id,
      grantId: input.grantId,
      kind: input.kind,
      familyGeneration: Number(row.family_generation),
      userGeneration: Number(row.user_generation),
    });
  }
  public async prepare(
    attempt: OAuthIssuance,
    token: OAuthPreparedToken,
    now: number,
  ): Promise<boolean> {
    const grant = await this.grant(attempt.grantId, now);
    if (
      !grant ||
      token.clientId !== grant.clientId ||
      token.userId !== grant.userId ||
      token.resources.length !== 1 ||
      token.resources[0] !== grant.resource ||
      token.scopes.some((scope) => !grant.scopes.includes(scope))
    )
      return false;
    const refresh = token.kind === "refresh";
    const table = refresh ? "oauth_refresh_tokens" : "oauth_access_tokens";
    const columns = [
      "id",
      "token",
      "client_id",
      "user_id",
      "session_id",
      "reference_id",
      "authorization_code_id",
      "resources",
      "requested_user_info_claims",
      "created_at",
      "expires_at",
      "scopes",
      refresh ? "auth_time" : "refresh_id",
    ];
    const values = [
      token.id,
      token.hash,
      token.clientId,
      token.userId,
      token.sessionId,
      grant.id,
      token.authorizationCodeId,
      JSON.stringify(token.resources),
      "[]",
      token.createdAt,
      Math.min(token.expiresAt, grant.expiresAt),
      JSON.stringify(token.scopes),
      refresh ? token.authTime : token.refreshId,
    ];
    const guards = [attempt.id, now, now];
    const changes = await this.driver.batch([
      statement(
        `insert into ${table} (${columns.join(",")}) select ${columns.map(() => "?").join(",")} where ${ATTEMPT_ACTIVE}`,
        ...values,
        ...guards,
      ),
      statement(
        `insert into oauth_token_bindings
        (kind,provider_id,token_hash,grant_id,issuance_id,family_generation,user_generation,expires_at)
        select ?,?,?,i.grant_id,i.id,i.family_generation,i.user_generation,?
        from oauth_issuances i where i.id=? and ${ATTEMPT_ACTIVE}
        and exists (select 1 from ${table} where id=?)`,
        token.kind,
        token.id,
        token.hash,
        Math.min(token.expiresAt, grant.expiresAt),
        attempt.id,
        ...guards,
        token.id,
      ),
    ]);
    return changes[0] === 1 && changes[1] === 1;
  }
  public async commit(
    attempt: OAuthIssuance,
    expected: readonly { readonly kind: "access" | "refresh"; readonly id: string }[],
    now: number,
  ): Promise<boolean> {
    if (
      expected.length < 1 ||
      expected.length > 2 ||
      expected.filter((t) => t.kind === "access").length !== 1
    )
      return false;
    const existence = expected
      .map(
        ({ kind }) => `exists (select 1 from oauth_token_bindings b
      join ${kind === "access" ? "oauth_access_tokens" : "oauth_refresh_tokens"} t on t.id=b.provider_id
      where b.issuance_id=? and b.kind=? and b.provider_id=? and b.expires_at>? and t.token=b.token_hash)`,
      )
      .join(" and ");
    const args = expected.flatMap((t) => [attempt.id, t.kind, t.id, now]);
    const changes = await this.driver.batch([
      statement(
        `update oauth_issuances set state='committed',committed_at=?
      where id=? and ${ATTEMPT_ACTIVE} and ${existence}
      and (select count(*) from oauth_token_bindings where issuance_id=?)=?`,
        now,
        attempt.id,
        attempt.id,
        now,
        now,
        ...args,
        attempt.id,
        expected.length,
      ),
    ]);
    return changes[0] === 1;
  }
  public async revokeFamily(grantId: string, now: number): Promise<void> {
    await this.driver.batch([
      statement(
        "update oauth_grants set revoked_at=?,generation=generation+1 where id=? and revoked_at is null",
        now,
        grantId,
      ),
    ]);
  }
  public async revokeReplay(inputHash: string, clientId: string, now: number): Promise<void> {
    await this.driver.batch([
      statement(
        `update oauth_grants set revoked_at=?,generation=generation+1
      where client_id=? and revoked_at is null and id in
      (select grant_id from oauth_issuances where kind='refresh' and input_hash=?)`,
        now,
        clientId,
        inputHash,
      ),
    ]);
  }
  public async abort(attempt: OAuthIssuance, now: number): Promise<void> {
    await this.driver.batch([
      statement(
        `update oauth_grants set revoked_at=?,generation=generation+1 where id=? and revoked_at is null
        and exists(select 1 from oauth_issuances where id=? and state='pending')`,
        now,
        attempt.grantId,
        attempt.id,
      ),
      statement(
        "update oauth_issuances set state='aborted' where id=? and state='pending'",
        attempt.id,
      ),
    ]);
  }
  public async authority(
    kind: "access" | "refresh",
    hash: string,
    clientId: string | undefined,
    now: number,
  ): Promise<OAuthAuthority | null> {
    const [row] = await this.driver.rows(
      `select g.*, b.provider_id, b.expires_at as token_expiry, u.role
      from oauth_token_bindings b join oauth_issuances i on i.id=b.issuance_id
      join oauth_grants g on g.id=b.grant_id ${ACCOUNT_JOINS} where b.kind=? and b.token_hash=?
      and (? is null or g.client_id=?) and b.expires_at>? and i.state='committed'
      and b.family_generation=g.generation and b.user_generation=coalesce(a.generation,0) and ${ACTIVE}`,
      [kind, hash, clientId ?? null, clientId ?? null, now, now],
    );
    return row
      ? Object.freeze({
          grant: grantRow(row),
          providerId: string(row, "provider_id"),
          role: string(row, "role"),
          expiresAt: Number(row.token_expiry),
        })
      : null;
  }
  public async listConnections(
    userId: string,
    after: string | undefined,
    limit: number,
  ): Promise<readonly OAuthConnection[]> {
    if (!Number.isInteger(limit) || limit < 1 || limit > 50)
      throw new TypeError("Invalid OAuth list limit.");
    const sql =
      after === undefined
        ? "select g.*,c.name as client_name from oauth_grants g join oauth_clients c on c.client_id=g.client_id where g.user_id=? order by g.created_at,g.id limit ?"
        : "select g.*,c.name as client_name from oauth_grants g join oauth_clients c on c.client_id=g.client_id where g.user_id=? and (g.created_at,g.id) > (select created_at,id from oauth_grants where id=? and user_id=?) order by g.created_at,g.id limit ?";
    return (
      await this.driver.rows(
        sql,
        after === undefined ? [userId, limit] : [userId, after, userId, limit],
      )
    ).map((row) => ({
      ...grantRow(row),
      clientName:
        typeof row.client_name === "string" && row.client_name.trim().length > 0
          ? row.client_name
          : string(row, "client_id"),
      ...(row.last_used_at === null ? {} : { lastUsedAt: Number(row.last_used_at) }),
    }));
  }
  public async revokeConnection(userId: string, grantId: string, now: number): Promise<boolean> {
    const result = await this.driver.batch([
      statement(
        `update oauth_grants set
      generation=case when revoked_at is null then generation+1 else generation end,
      revoked_at=coalesce(revoked_at,?) where id=? and user_id=?`,
        now,
        grantId,
        userId,
      ),
    ]);
    return result[0] === 1;
  }
  public async invalidateUser(userId: string, now: number): Promise<void> {
    await this.driver.batch([statement(oauthUserInvalidationSql(), now, userId)]);
  }
  /** Optional phases bound Worker maintenance to three queries per invocation. */
  public async cleanup(now: number, limit: number, phase?: 0 | 1 | 2): Promise<void> {
    if (!Number.isInteger(limit) || limit < 1 || limit > 20)
      throw new TypeError("Invalid OAuth cleanup limit.");
    const statements = [
      statement(
        "delete from verification where id in (select id from verification where expires_at<=? and identifier like 'lace-mcp:%' limit ?)",
        now,
        limit,
      ),
      statement(
        `update oauth_grants set revoked_at=?,generation=generation+1 where revoked_at is null and id in
        (select grant_id from oauth_issuances where state='pending' and pending_expires_at<=? limit ?)`,
        now,
        now,
        limit,
      ),
      statement(
        "update oauth_issuances set state='aborted' where id in (select id from oauth_issuances where state='pending' and pending_expires_at<=? limit ?)",
        now,
        limit,
      ),
      statement(
        `delete from oauth_access_tokens where id in (select b.provider_id from oauth_token_bindings b join oauth_issuances i on i.id=b.issuance_id
        where b.kind='access' and (i.state='aborted' or b.expires_at<=?) limit ?)`,
        now,
        limit,
      ),
      statement(
        `delete from oauth_refresh_tokens where id in (select b.provider_id from oauth_token_bindings b join oauth_issuances i on i.id=b.issuance_id
        where b.kind='refresh' and (i.state='aborted' or b.expires_at<=?)
        and not exists(select 1 from oauth_access_tokens t where t.refresh_id=b.provider_id) limit ?)`,
        now,
        limit,
      ),
      statement(
        "delete from oauth_token_bindings where (kind,provider_id) in (select kind,provider_id from oauth_token_bindings where expires_at<=? limit ?)",
        now,
        limit,
      ),
      statement(
        `delete from oauth_issuances where id in (select i.id from oauth_issuances i where i.retain_until<=?
        and not exists(select 1 from oauth_token_bindings b where b.issuance_id=i.id) limit ?)`,
        now,
        limit,
      ),
      statement(
        `delete from oauth_grants where id in (select g.id from oauth_grants g where g.expires_at<=?
        and not exists(select 1 from oauth_issuances i where i.grant_id=g.id) limit ?)`,
        now,
        limit,
      ),
    ];
    // Preserve revocation/abort in one atomic batch, then remove dependent rows
    // before issuance/grant parents. Node startup can execute all phases at once.
    const range =
      phase === undefined
        ? [0, 8]
        : [
            [0, 3],
            [3, 6],
            [6, 8],
          ][phase]!;
    await this.driver.batch(statements.slice(range[0], range[1]));
  }
}
