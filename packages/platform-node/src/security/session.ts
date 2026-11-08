import {
  importTokenUserInvalidationSql,
  oauthUserInvalidationSql,
  sessionRecord,
} from "@lacecms/db";
import type { SessionRecord, SessionSecurityPort } from "@lacecms/application";
import type { UnixMilliseconds } from "@lacecms/domain";
import type Database from "better-sqlite3";

/** SQLite session listing and revocation for one user. */
export class NodeSessionSecurity implements SessionSecurityPort {
  public constructor(
    private readonly connection: Database.Database,
    private readonly now: () => UnixMilliseconds,
  ) {}

  public async listSessions(input: {
    readonly now: UnixMilliseconds;
    readonly userId: string;
  }): Promise<readonly SessionRecord[]> {
    return this.connection
      .prepare(
        "select id, created_at, updated_at, user_agent from session where user_id = ? and expires_at > ? order by updated_at desc, id",
      )
      .all(input.userId, Number(input.now))
      .map((row) => sessionRecord(row as Record<string, unknown>));
  }

  public async deleteSession(input: {
    readonly sessionId: string;
    readonly userId: string;
  }): Promise<boolean> {
    return (
      this.connection
        .prepare("delete from session where id = ? and user_id = ?")
        .run(input.sessionId, input.userId).changes === 1
    );
  }

  public async deleteOtherSessions(input: {
    readonly keepSessionId: string;
    readonly userId: string;
  }): Promise<number> {
    return this.connection.transaction(() => {
      this.connection.prepare(oauthUserInvalidationSql()).run(Number(this.now()), input.userId);
      this.connection
        .prepare(importTokenUserInvalidationSql())
        .run(Number(this.now()), input.userId);
      return this.connection
        .prepare("delete from session where user_id = ? and id <> ?")
        .run(input.userId, input.keepSessionId).changes;
    })();
  }

  public async deleteUserSessions(input: { readonly userId: string }): Promise<number | null> {
    return this.connection.transaction(() => {
      if (
        this.connection.prepare("select 1 from user where id = ?").get(input.userId) === undefined
      )
        return null;
      this.connection.prepare(oauthUserInvalidationSql()).run(Number(this.now()), input.userId);
      this.connection
        .prepare(importTokenUserInvalidationSql())
        .run(Number(this.now()), input.userId);
      return this.connection.prepare("delete from session where user_id = ?").run(input.userId)
        .changes;
    })();
  }
}
