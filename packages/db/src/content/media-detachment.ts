import { MAX_MEDIA_USAGE_ENTRIES } from "@lacecms/content";
import { contentEntryId, DomainError } from "@lacecms/domain";
import type { MediaDraftOwner } from "@lacecms/application";

/** Both the admission read and the guarded draft write see current snapshot owners only. */
export const detachOwnersSql = `select e.id as entry_id, d.revision,
    max(case when r.snapshot_id=e.published_snapshot_id then 1 else 0 end) as published
  from content_media_references r
  join content_snapshots s on s.id=r.snapshot_id
  join content_entries e on e.id=s.entry_id
  join content_snapshots d on d.id=e.draft_snapshot_id
  where r.media_id=? and r.snapshot_id in (e.draft_snapshot_id,e.published_snapshot_id)
  group by e.id order by e.id limit ${MAX_MEDIA_USAGE_ENTRIES + 1}`;

export const detachAdmissionSql = `with owners as (${detachOwnersSql})
  select owners.* from media m left join owners on 1
  where m.id=? and m.status='active' order by entry_id`;

export interface DetachAdmissionRow {
  readonly entry_id: string | null;
  readonly revision: number;
  readonly published: number;
}

export function admittedDrafts(rows: readonly DetachAdmissionRow[]): readonly MediaDraftOwner[] {
  if (!rows.length)
    throw new DomainError("CONTENT_INVALID_STATE", "Media must exist and be active.");
  if (rows.length > MAX_MEDIA_USAGE_ENTRIES || rows.some((row) => row.published === 1))
    throw new DomainError(
      "MEDIA_IN_USE",
      "Published usage or the entry limit prevents detachment.",
    );
  return rows.flatMap((row) =>
    row.entry_id === null
      ? []
      : [
          {
            entryId: contentEntryId(row.entry_id),
            expectedRevision: row.revision,
          },
        ],
  );
}
