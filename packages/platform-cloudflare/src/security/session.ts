import {
  importTokenUserInvalidationSql,
  oauthUserInvalidationSql,
  sessionRecord,
} from "@lacecms/db";
import type { SessionRecord, SessionSecurityPort } from "@lacecms/application";
import type { UnixMilliseconds } from "@lacecms/domain";
import type { D1Database } from "../d1/database.js";
import { bindStatement } from "./statements.js";

/** D1 session listing and revocation for one user. */
export class D1SessionSecurity implements SessionSecurityPort {
  public constructor(
    private readonly database: D1Database,
    private readonly now: () => UnixMilliseconds,
  ) {}

  public async listSessions(input: {
    readonly now: UnixMilliseconds;
    readonly userId: string;
  }): Promise<readonly SessionRecord[]> {
    const rows = await bindStatement(
      this.database,
      "select id, created_at, updated_at, user_agent from session where user_id = ? and expires_at > ? order by updated_at desc, id",
      input.userId,
      Number(input.now),
    ).all();
    return rows.results.map((row) => sessionRecord(row));
  }

  public async deleteSession(input: {
    readonly sessionId: string;
    readonly userId: string;
  }): Promise<boolean> {
    const result = await bindStatement(
      this.database,
      "delete from session where id = ? and user_id = ?",
      input.sessionId,
      input.userId,
    ).run();
    return result.meta.changes === 1;
  }

  public async deleteOtherSessions(input: {
    readonly keepSessionId: string;
    readonly userId: string;
  }): Promise<number> {
    const [result] = await this.database.batch([
      bindStatement(
        this.database,
        "delete from session where user_id = ? and id <> ?",
        input.userId,
        input.keepSessionId,
      ),
      bindStatement(this.database, oauthUserInvalidationSql(), Number(this.now()), input.userId),
      bindStatement(
        this.database,
        importTokenUserInvalidationSql(),
        Number(this.now()),
        input.userId,
      ),
    ]);
    return result?.meta.changes ?? 0;
  }

  public async deleteUserSessions(input: { readonly userId: string }): Promise<number | null> {
    const [found, deleted] = await this.database.batch([
      bindStatement(this.database, "select 1 as found from user where id = ?", input.userId),
      bindStatement(this.database, "delete from session where user_id = ?", input.userId),
      bindStatement(this.database, oauthUserInvalidationSql(), Number(this.now()), input.userId),
      bindStatement(
        this.database,
        importTokenUserInvalidationSql(),
        Number(this.now()),
        input.userId,
      ),
    ]);
    return found?.results[0] === undefined ? null : (deleted?.meta.changes ?? 0);
  }
}
