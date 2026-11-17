import type { PreviewAccessPort } from "@lacecms/application";
import { defaultRolePermissions, PREVIEW_READY_MS, unixMilliseconds } from "@lacecms/domain";
import type { Role, UnixMilliseconds } from "@lacecms/domain";
import type { ContentReadSql } from "../reads/content-reader.js";
import { previewMutation } from "./capture.js";
import { previewMaintenanceLimit } from "./maintenance.js";
import type { WritePlan, WritePlanResult } from "../write-plan/plan.js";
import { PREVIEW_CURRENT_JOIN } from "./rows.js";

const readerRoles = (Object.keys(defaultRolePermissions) as Role[]).filter((role) =>
  defaultRolePermissions[role].includes("content:read"),
);
const parents = "session s join user u on u.id = s.user_id";
const activeParent = `s.expires_at > ? and u.disabled = 0
  and u.role in (${readerRoles.map(() => "?").join(",")})`;
const currentReady = `g.state = 'ready' and g.expires_at > ?
  and g.output_sha256 is not null and g.output_bytes is not null`;
const liveGrant = `from preview_sessions p join (${parents}) on s.id = p.session_id
  where p.token_hash = ? and p.origin = ? and p.expires_at > ? and ${activeParent}`;

export class SqlPreviewAccess implements PreviewAccessPort {
  public constructor(
    private readonly sql: ContentReadSql,
    private readonly execute: <Miss>(
      plan: WritePlan<Miss>,
      now: number,
    ) => Promise<WritePlanResult<Miss>>,
  ) {}

  public readonly authorizeHandoff: PreviewAccessPort["authorizeHandoff"] = async (input) => {
    const { id, browserHash, codeHash, adminOrigin, previewOrigin, returnPath, generationId } =
      input;
    const { sessionId, userId, expiresAt, now } = input;
    const result = await this.execute(
      previewMutation(
        {
          sql: `? > ? and exists (select 1 from ${parents}
            where s.id = ? and u.id = ? and ${activeParent})
            and exists (select 1 from ${PREVIEW_CURRENT_JOIN} where g.id = ? and ${currentReady})
            and not exists (select 1 from preview_handoffs where id = ?)`,
          params: [expiresAt, now, sessionId, userId, now, ...readerRoles, generationId, now, id],
        },
        (guard) => [
          {
            sql: `insert into preview_handoffs
            (id,browser_hash,code_hash,admin_origin,preview_origin,return_path,generation_id,session_id,expires_at)
            select ?,?,?,?,?,?,?,?,? where ${guard.sql}`,
            params: [
              id,
              browserHash,
              codeHash,
              adminOrigin,
              previewOrigin,
              returnPath,
              generationId,
              sessionId,
              expiresAt,
              ...guard.params,
            ],
            expectedChanges: 1,
          },
        ],
      ),
      now,
    );
    return result.kind === "committed";
  };

  public readonly redeemHandoff: PreviewAccessPort["redeemHandoff"] = async (input) => {
    const { id, browserHash, codeHash, adminOrigin, previewOrigin, tokenHash, now } = input;
    const result = await this.execute(
      previewMutation(
        {
          sql: `exists (select 1 from preview_handoffs h join (${parents}) on s.id = h.session_id
            join (${PREVIEW_CURRENT_JOIN}) on g.id = h.generation_id
            where h.id = ? and h.browser_hash = ? and h.code_hash = ?
            and h.admin_origin = ? and h.preview_origin = ? and h.expires_at > ?
            and h.consumed_at is null and ${activeParent} and ${currentReady})`,
          params: [
            id,
            browserHash,
            codeHash,
            adminOrigin,
            previewOrigin,
            now,
            now,
            ...readerRoles,
            now,
          ],
        },
        (guard) => [
          {
            sql: `insert into preview_sessions (token_hash,session_id,origin,expires_at)
              select ?,s.id,h.preview_origin,min(s.expires_at,?) from preview_handoffs h
              join session s on s.id = h.session_id where h.id = ? and ${guard.sql}`,
            params: [tokenHash, now + PREVIEW_READY_MS, id, ...guard.params],
            expectedChanges: 1,
          },
          {
            sql: `update preview_handoffs set consumed_at = ? where id = ? and ${guard.sql}`,
            params: [now, id, ...guard.params],
            expectedChanges: 1,
          },
          {
            slot: "previewSession",
            sql: `select h.return_path as returnPath,p.expires_at as expiresAt from preview_handoffs h
              join preview_sessions p on p.session_id = h.session_id
              where h.id = ? and p.token_hash = ? and ${guard.sql}`,
            params: [id, tokenHash, ...guard.params],
          },
        ],
      ),
      now,
    );
    if (result.kind === "rejected") return null;
    const row = result.slots.previewSession?.[0] as
      | { returnPath: string; expiresAt: number }
      | undefined;
    return row ? { ...row, expiresAt: unixMilliseconds(row.expiresAt) } : null;
  };

  public readonly previewDelivery: PreviewAccessPort["previewDelivery"] = async (
    tokenHash,
    origin,
    id,
    now,
  ) => {
    const [row] = await this.sql.all<{
      revision: number | null;
      expiresAt: number;
      sha256: string;
      bytes: number;
    }>(
      `select g.revision,g.expires_at as expiresAt,g.output_sha256 as sha256,g.output_bytes as bytes
       from (select 1 ${liveGrant}) authorized
       left join (${PREVIEW_CURRENT_JOIN}) on g.id = ? and ${currentReady}`,
      tokenHash,
      origin,
      now,
      now,
      ...readerRoles,
      id,
      now,
    );
    if (row === undefined) return "denied";
    if (row.revision === null) return null;
    return {
      revision: row.revision,
      expiresAt: unixMilliseconds(row.expiresAt),
      manifest: { sha256: row.sha256, bytes: row.bytes },
    };
  };

  public async purgeExpiredAccess(now: UnixMilliseconds, limit: number): Promise<void> {
    const batch = previewMaintenanceLimit(limit);
    await this.execute(
      previewMutation({ sql: "1", params: [] }, (guard) => [
        {
          sql: `delete from preview_handoffs where id in (
          select id from preview_handoffs where expires_at <= ? order by expires_at,id limit ?
        ) and ${guard.sql}`,
          params: [now, batch, ...guard.params],
        },
        {
          sql: `delete from preview_sessions where token_hash in (
          select token_hash from preview_sessions where expires_at <= ? order by expires_at,token_hash limit ?
        ) and ${guard.sql}`,
          params: [now, batch, ...guard.params],
        },
      ]),
      now,
    );
  }
}
