import { invalidatePreviews } from "../write-plan/preview-invalidation.js";
import type { AdmitPreview, PreviewAdmission } from "@lacecms/application";
import { PREVIEW_MAX_MODELS, PREVIEW_OVERALL_MS } from "@lacecms/domain";
import { SQL_MAX_DRAFT_BLOCKS, SQL_MAX_DRAFT_MEDIA_REFERENCES } from "../shared/limits.js";
import type { WritePlan, WritePlanStatement } from "../write-plan/plan.js";
import {
  fenceParams,
  GENERATION_COLUMNS,
  PREVIEW_FENCE_CONDITION,
  PREVIEW_REPLAY_SQL,
  replay,
} from "./rows.js";
import type { PreviewGenerationRow } from "./rows.js";

type Rejection = Exclude<PreviewAdmission, { kind: "admitted" }>;
export const PREVIEW_ADMITTED_ROW = "generation";
const MAX_PROJECTION_BYTES = 1024 * 1024;
const reject = (reason: Extract<PreviewAdmission, { kind: "rejected" }>["reason"]) =>
  ({ kind: "rejected", reason }) as const;

export function previewAdmissionPlan(input: AdmitPreview): WritePlan<Rejection> | null {
  const {
    id,
    actorId,
    idempotencyKey,
    entryId,
    expectedRevision,
    draftSnapshotId,
    now,
    path,
    modelKey,
    projection,
  } = input;
  const fields = JSON.stringify(projection.fields);
  const blocks = JSON.stringify(
    Object.fromEntries(projection.blocks.map((block) => [block.key, block.data])),
  );
  const media = JSON.stringify([...new Set(projection.mediaReferences.map((r) => r.mediaId))]);
  const linkProjection = projection.internalLinks
    .filter((r) => r.delivered)
    .map(({ sourceKey, area, pointer, targetId }) => ({ sourceKey, area, pointer, targetId }));
  const links = JSON.stringify(linkProjection);
  if (
    projection.blocks.length > SQL_MAX_DRAFT_BLOCKS ||
    projection.mediaReferences.length > SQL_MAX_DRAFT_MEDIA_REFERENCES ||
    new TextEncoder().encode(fields + blocks + media + links).length > MAX_PROJECTION_BYTES
  )
    return null;

  if ((JSON.parse(input.configuration) as unknown[]).length > PREVIEW_MAX_MODELS) return null;

  const existing = { sql: PREVIEW_REPLAY_SQL, params: [actorId, idempotencyKey] };
  const checks = {
    revision: {
      sql: `exists(select 1 from content_entries e join content_snapshots d on d.id = e.draft_snapshot_id
        where e.id = ? and e.model_key = ? and d.id = ? and d.revision = ?)`,
      params: [entryId, modelKey, draftSnapshotId, expectedRevision],
    },
    route: {
      sql: "not exists(select 1 from published_routes where path = ? and entry_id <> ?)",
      params: [path, entryId],
    },
    context: { sql: PREVIEW_FENCE_CONDITION, params: fenceParams(input) },
    busy: {
      sql: "not exists(select 1 from preview_execution_slot where singleton_key = 1)",
      params: [],
    },
    media: {
      sql: `not exists(select 1 from json_each(?) j
        where not exists(select 1 from media m where m.id = j.value and m.status = 'active'))`,
      params: [media],
    },
    blocks: {
      sql: `not exists(select 1 from content_blocks b where b.snapshot_id = ? and b.hidden = 0
        and not exists(select 1 from json_each(?) j where j.key = b.block_key))`,
      params: [draftSnapshotId, blocks],
    },
  } as const;
  const constraints = Object.values(checks);
  return {
    admission: {
      sql: `not exists (${existing.sql}) and ${constraints.map(({ sql }) => `(${sql})`).join(" and ")}`,
      params: [...existing.params, ...constraints.flatMap(({ params }) => [...params])],
    },
    diagnostics: {
      existing,
      checks: {
        sql: `select ${Object.entries(checks)
          .map(([key, { sql }]) => `(${sql}) as "${key}"`)
          .join(",")}`,
        params: constraints.flatMap(({ params }) => [...params]),
      },
    },
    diagnose: (rows) => {
      const old = rows.existing?.[0] as PreviewGenerationRow | undefined;
      if (old !== undefined) {
        return replay(old, input);
      }
      const state = rows.checks?.[0] as Record<keyof typeof checks, number>;
      if (!state.revision) return reject("PREVIEW_REVISION_CONFLICT");
      if (!state.route) return reject("PREVIEW_ROUTE_CONFLICT");
      if (!state.context) return reject("PREVIEW_CONTEXT_CHANGED");
      if (!state.busy) return reject("PREVIEW_BUSY");
      return reject("PREVIEW_VALIDATION_FAILED");
    },
    statements: (guard): readonly WritePlanStatement[] => [
      {
        sql: `insert into preview_generations
          (id,entry_id,model_key,revision,path,public_version,capture_epoch,configuration,source_commit,executor,created_by,idempotency_key,state,created_at,overall_deadline)
          select ?,?,?,?,?,?,?,?,?,?,?,?,'preparing',?,? where ${guard.sql}`,
        params: [
          id,
          entryId,
          modelKey,
          expectedRevision,
          path,
          input.publicVersion,
          input.captureEpoch,
          input.configuration,
          input.source.commit,
          input.source.executor,
          actorId,
          idempotencyKey,
          now,
          now + PREVIEW_OVERALL_MS,
          ...guard.params,
        ],
        expectedChanges: 1,
      },
      {
        sql: `insert into preview_execution_slot (singleton_key,generation_id) select 1,? where ${guard.sql}`,
        params: [id, ...guard.params],
        expectedChanges: 1,
      },
      {
        sql: `insert into preview_targets (generation_id,title,slug,fields_json,seo_json,links_json)
          select ?,title,slug,?,seo_json,? from content_snapshots where id = ? and ${guard.sql}`,
        params: [id, fields, links, draftSnapshotId, ...guard.params],
        expectedChanges: 1,
      },
      {
        checkpoint: "preview.capture-target",
        sql: `insert into preview_target_blocks
          (generation_id,block_key,block_type,position,schema_version,data_json,created_at,updated_at,anchor,class_name,settings_json)
          select ?,b.block_key,b.block_type,b.position,b.schema_version,j.value,b.created_at,b.updated_at,b.anchor,b.class_name,b.settings_json
            from content_blocks b join json_each(?) j on j.key = b.block_key
           where b.snapshot_id = ? and b.hidden = 0 and ${guard.sql}`,
        params: [id, blocks, draftSnapshotId, ...guard.params],
      },
      {
        sql: `insert into preview_media_dependencies (generation_id,media_id,target)
          select ?,j.value,1 from json_each(?) j where ${guard.sql}`,
        params: [id, media, ...guard.params],
      },
      invalidatePreviews("entry", entryId, now, {
        sql: `id <> ? and ${guard.sql}`,
        params: [id, ...guard.params],
      }),
      {
        sql: `insert into preview_current (entry_id,generation_id) select ?,? where ${guard.sql}
          on conflict(entry_id) do update set generation_id = excluded.generation_id`,
        params: [entryId, id, ...guard.params],
        expectedChanges: 1,
      },
      {
        sql: `select ${GENERATION_COLUMNS} from preview_generations g where g.id = ?`,
        params: [id],
        slot: PREVIEW_ADMITTED_ROW,
      },
    ],
  };
}
