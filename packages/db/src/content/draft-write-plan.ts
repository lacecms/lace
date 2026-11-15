import type { CreateContentEntryInput, SaveCompleteDraftInput } from "@lacecms/application";
import { DomainError, isSingletonKind } from "@lacecms/domain";
import type { ContentBlock, DraftMediaReference } from "@lacecms/domain";
import { replaceInternalLinkStatements } from "../links/statements.js";
import { seoJson } from "./snapshots.js";
import type { WritePlan, WritePlanGuard, WritePlanStatement } from "../write-plan/plan.js";

export type DraftGuardMiss =
  | "missing_model"
  | "singleton"
  | "missing_source"
  | "stale_source"
  | "missing_draft"
  | "stale_draft"
  | "media";

type GuardRow = {
  readonly model_ok: number;
  readonly singleton_ok: number;
  readonly source_ok: number;
  readonly revision_ok: number;
  readonly media_ok: number;
};
const mediaCheck = `not exists (select 1 from json_each(?) r left join media m on m.id = r.value and m.status = 'active' where m.id is null)`;
const mediaIds = (references: readonly DraftMediaReference[]) =>
  JSON.stringify(references.map((r) => r.mediaId));

function values(rows: number, width: number, offset: number): string {
  return Array.from(
    { length: rows },
    (_, row) =>
      `(${Array.from({ length: width }, (_, col) => `?${offset + row * width + col + 1}`).join(", ")})`,
  ).join(", ");
}

function blockStatements(
  snapshotId: string,
  timestamp: number,
  blocks: readonly ContentBlock[],
  guard: WritePlanGuard,
): WritePlanStatement[] {
  const statements: WritePlanStatement[] = [];
  const shared = [snapshotId, timestamp, ...guard.params];
  const size = Math.floor((100 - shared.length) / 6);
  for (let offset = 0; offset < blocks.length; offset += size) {
    const group = blocks.slice(offset, offset + size);
    statements.push({
      sql: `insert into content_blocks (snapshot_id, block_key, block_type, position, schema_version, data_json, anchor, class_name, hidden, settings_json, created_at, updated_at)
      select ?1, v.column1, v.column2, v.column3, v.column4, v.column5, v.column6 ->> '$.anchor', v.column6 ->> '$.className', coalesce(v.column6 ->> '$.hidden', 0), coalesce(v.column6 -> '$.settings', '{}'), ?2, ?2
      from (values ${values(group.length, 6, shared.length)}) v where ${guard.params.length ? guard.sql.replace("?", "?3") : guard.sql}`,
      params: [
        ...shared,
        ...group.flatMap((block) => [
          block.key,
          block.type,
          block.position,
          block.schemaVersion,
          JSON.stringify(block.data),
          JSON.stringify({
            ...(block.anchor === undefined ? {} : { anchor: block.anchor }),
            ...(block.className === undefined ? {} : { className: block.className }),
            hidden: block.hidden ? 1 : 0,
            settings: block.settings,
          }),
        ]),
      ],
    });
  }
  return statements;
}

function referenceStatements(
  snapshotId: string,
  timestamp: number,
  references: readonly DraftMediaReference[],
  guard: WritePlanGuard,
): WritePlanStatement[] {
  const statements: WritePlanStatement[] = [];
  const shared = [snapshotId, timestamp, ...guard.params];
  const size = Math.floor((100 - shared.length) / 3);
  for (let offset = 0; offset < references.length; offset += size) {
    const group = references.slice(offset, offset + size);
    statements.push({
      sql: `insert into content_media_references (snapshot_id, source_key, field_path, media_id, created_at)
      select ?1, v.column1, v.column2, v.column3, ?2 from (values ${values(group.length, 3, shared.length)}) v where ${guard.params.length ? guard.sql.replace("?", "?3") : guard.sql}`,
      params: [...shared, ...group.flatMap((r) => [r.sourceKey, r.fieldPath, r.mediaId])],
    });
  }
  return statements;
}

function linkStatements(
  snapshotId: string,
  links: NonNullable<CreateContentEntryInput["internalLinks"]>,
  guard: WritePlanGuard,
): WritePlanStatement[] {
  return replaceInternalLinkStatements(snapshotId, links, guard.sql).map((statement, index) => ({
    ...statement,
    params: [...statement.params, ...guard.params],
    ...(index === 0 ? { checkpoint: "draft.internal-links" } : {}),
  }));
}

/** Creation and duplication share admission and all draft projection writes. */
export function createDraftWritePlan(input: CreateContentEntryInput): WritePlan<DraftGuardMiss> {
  const { id, model, draft } = input.entry;
  const source = input.duplicateOf;
  const stateSql = `select exists(select 1 from content_models where key=?) as model_ok,
    (?=0 or not exists(select 1 from content_entries where model_key=? and singleton_key=1)) as singleton_ok,
    (? is null or exists(select 1 from content_entries where id=?)) as source_ok,
    (? is null or exists(select 1 from content_entries e join content_snapshots s on s.id=e.draft_snapshot_id where e.id=? and s.revision=?)) as revision_ok,
    ${mediaCheck} as media_ok`;
  const stateParams = [
    model.key,
    isSingletonKind(model.kind) ? 1 : 0,
    model.key,
    source?.entryId ?? null,
    source?.entryId ?? null,
    source?.entryId ?? null,
    source?.entryId ?? null,
    source?.expectedRevision ?? null,
    mediaIds(input.mediaReferences),
  ];
  return {
    admission: {
      sql: `exists(select 1 from (${stateSql}) where model_ok and singleton_ok and source_ok and revision_ok and media_ok)`,
      params: stateParams,
    },
    diagnostics: { state: { sql: stateSql, params: stateParams } },
    diagnose: (rows) => {
      const row = rows.state?.[0] as GuardRow;
      if (!row.source_ok) return "missing_source";
      if (!row.revision_ok) return "stale_source";
      if (!row.model_ok) return "missing_model";
      if (!row.singleton_ok) return "singleton";
      return "media";
    },
    statements: (g) => [
      {
        sql: `insert into content_entries (id,model_key,singleton_key,created_by,created_at,updated_at) select ?,?,?,?,?,? where ${g.sql}`,
        params: [
          id,
          model.key,
          isSingletonKind(model.kind) ? 1 : null,
          draft.updatedBy.id,
          draft.createdAt,
          draft.updatedAt,
          ...g.params,
        ],
        expectedChanges: 1,
      },
      {
        sql: `insert into content_snapshots (id,entry_id,revision,slug,title,fields_json,seo_json,schema_version,created_at,updated_at,updated_by) select ?,?,?,?,?,?,?,config_version,?,?,? from content_models where key=? and ${g.sql}`,
        params: [
          draft.id,
          id,
          draft.revision,
          draft.slug ?? null,
          draft.title,
          JSON.stringify(draft.fields),
          seoJson(draft.seo),
          draft.createdAt,
          draft.updatedAt,
          draft.updatedBy.id,
          model.key,
          ...g.params,
        ],
        expectedChanges: 1,
      },
      ...blockStatements(draft.id, draft.updatedAt, draft.blocks, g),
      ...referenceStatements(draft.id, draft.updatedAt, input.mediaReferences, g),
      ...linkStatements(draft.id, input.internalLinks ?? [], g),
      {
        checkpoint: "draft.internal-links.complete",
        sql: `update content_entries set draft_snapshot_id=? where id=? and ${g.sql}`,
        params: [draft.id, id, ...g.params],
        expectedChanges: 1,
      },
    ],
  };
}

/** Complete replacement is guarded by draft identity, revision and all media. */
export function saveDraftWritePlan(
  input: SaveCompleteDraftInput,
  draftId: string,
): WritePlan<DraftGuardMiss> {
  const m = input.mutation;
  const stateSql = `select exists(select 1 from content_entries where id=? and draft_snapshot_id is not null) as model_ok,
    exists(select 1 from content_entries e join content_snapshots s on s.id=e.draft_snapshot_id where e.id=? and s.id=? and s.revision=?) as revision_ok,
    ${mediaCheck} as media_ok`;
  const stateParams = [
    input.entryId,
    input.entryId,
    draftId,
    m.expectedRevision,
    mediaIds(m.mediaReferences),
  ];
  return {
    admission: {
      sql: `exists(select 1 from (${stateSql}) where model_ok and revision_ok and media_ok)`,
      params: stateParams,
    },
    diagnostics: { state: { sql: stateSql, params: stateParams } },
    diagnose: (rows) => {
      const row = rows.state?.[0] as GuardRow;
      return !row.model_ok ? "missing_draft" : !row.revision_ok ? "stale_draft" : "media";
    },
    statements: (g) => [
      {
        sql: `delete from content_blocks where snapshot_id=? and ${g.sql}`,
        params: [draftId, ...g.params],
      },
      {
        sql: `delete from content_media_references where snapshot_id=? and ${g.sql}`,
        params: [draftId, ...g.params],
      },
      ...blockStatements(draftId, m.updatedAt, m.blocks, g),
      ...referenceStatements(draftId, m.updatedAt, m.mediaReferences, g),
      ...linkStatements(draftId, input.internalLinks ?? [], g),
      {
        checkpoint: "draft.internal-links.complete",
        sql: `update content_entries set updated_at=? where id=? and ${g.sql}`,
        params: [m.updatedAt, input.entryId, ...g.params],
        expectedChanges: 1,
      },
      {
        sql: `update content_snapshots set revision=revision+1,slug=?,title=?,fields_json=?,seo_json=?,updated_at=?,updated_by=? where id=? and ${g.sql}`,
        params: [
          m.slug ?? null,
          m.title,
          JSON.stringify(m.fields),
          seoJson(m.seo),
          m.updatedAt,
          m.updatedBy.id,
          draftId,
          ...g.params,
        ],
        expectedChanges: 1,
      },
    ],
  };
}

/** Maps typed admission evidence to the existing portable repository errors. */
export function rejectDraftWrite(reason: DraftGuardMiss, modelKey: string): never {
  switch (reason) {
    case "missing_model":
      throw new DomainError("CONTENT_INVALID_STATE", `Content model ${modelKey} does not exist.`);
    case "singleton":
      throw new DomainError(
        "CONTENT_MODEL_CARDINALITY_CONFLICT",
        "A page or global model already has its singleton entry.",
      );
    case "missing_source":
      throw new DomainError("CONTENT_INVALID_STATE", "Content entry does not exist.");
    case "stale_source":
      throw new DomainError(
        "CONTENT_REVISION_CONFLICT",
        "The source draft revision no longer matches the duplicate guard.",
      );
    case "missing_draft":
      throw new DomainError(
        "CONTENT_INVALID_STATE",
        "Content entry does not have a mutable draft.",
      );
    case "stale_draft":
      throw new DomainError(
        "CONTENT_REVISION_CONFLICT",
        "The draft revision no longer matches the expected revision.",
      );
    case "media":
      throw new DomainError("CONTENT_INVALID_STATE", "Media is unavailable for reference.");
  }
}
