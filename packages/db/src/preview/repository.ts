import type {
  AdmitPreview,
  ExportBuildContentPageInput,
  PreviewAdmission,
  PreviewCaptureFence,
  PreviewClaim,
  PreviewCommandPort,
  PreviewCleanupItem,
  PreviewMaintenancePort,
  PreviewStopTarget,
  PreviewExecution,
  PreviewGeneration,
  PreviewObject,
  PreviewReadPort,
  PreviewRequest,
  PreviewStatus,
  PreviewTarget,
} from "@lacecms/application";
import { BUILD_EXPORT_PAGE_BYTE_BUDGET } from "@lacecms/application";
import { unixMilliseconds } from "@lacecms/domain";
import type {
  ActorId,
  ContentEntryId,
  MediaId,
  PreviewFailureReason,
  UnixMilliseconds,
} from "@lacecms/domain";
import type { BlockRow } from "../content/blocks.js";
import { storedBlock } from "../content/block-row.js";
import { MEDIA_COLUMNS_SQL, mediaMetadata } from "../media/catalog.js";
import type { ContentReadSql, SqlContentReader } from "../reads/content-reader.js";
import { parseObject } from "../shared/values.js";
import type { WritePlan, WritePlanResult } from "../write-plan/plan.js";
import {
  failPreviewPreparationPlan,
  previewMediaSet,
  previewStoredObject,
  sealPreviewInputPlan,
  trackPreviewMediaPlan,
} from "./capture.js";
import {
  bindPreviewRunPlan,
  claimPreviewPlan,
  EXECUTION_ROW,
  failPreviewExecutionPlan,
  failPreviewRunPlan,
  finalizePreviewPlan,
  finalizedPreviewRead,
  isPreviewFailureReason,
  RUNNING_PREVIEW_SQL,
  settlePreviewDeadlinePlan,
  validPreviewClaim,
} from "./execution.js";
import {
  confirmPreviewExecutorStoppedPlan,
  duePreviewDeadlinesSql,
  PREVIEW_STOP_SQL,
  PREVIEW_PURGED_COUNT,
  previewCleanupSql,
  previewMaintenanceLimit,
  purgePreviewHistoryPlan,
  recordPreviewPurgedPlan,
} from "./maintenance.js";
import { PREVIEW_ADMITTED_ROW, previewAdmissionPlan } from "./admission.js";
import {
  claimParams,
  GENERATION_COLUMNS,
  generation,
  PREVIEW_CURRENT_JOIN,
  PREVIEW_FENCE_SQL,
  PREVIEW_REPLAY_SQL,
  replay,
} from "./rows.js";
import type { PreviewExecutionRow, PreviewGenerationRow } from "./rows.js";
import { SqlPreviewAccess } from "./access.js";

export type ExecutePreviewPlan = <Miss>(
  plan: WritePlan<Miss>,
  now: number,
) => Promise<WritePlanResult<Miss>>;

function execution(row: PreviewExecutionRow): PreviewExecution {
  return {
    generation: generation(row),
    input: { sha256: row.input_sha256, bytes: row.input_bytes },
    deadline: unixMilliseconds(row.execution_deadline!),
  };
}

export class SqlPreviewRepository
  implements PreviewReadPort, PreviewCommandPort, PreviewMaintenancePort
{
  public readonly access: SqlPreviewAccess;

  public constructor(
    private readonly sql: ContentReadSql,
    private readonly execute: ExecutePreviewPlan,
    private readonly content: Pick<SqlContentReader, "exportBuildContentPage">,
  ) {
    this.access = new SqlPreviewAccess(sql, execute);
  }

  public async previewContextPage(input: ExportBuildContentPageInput) {
    return this.content.exportBuildContentPage(input, BUILD_EXPORT_PAGE_BYTE_BUDGET);
  }

  public async previewCaptureFence(): Promise<PreviewCaptureFence> {
    return (await this.sql.all<PreviewCaptureFence>(PREVIEW_FENCE_SQL))[0]!;
  }

  public async findPreviewRequest(
    input: PreviewRequest & { readonly actorId: ActorId },
  ): Promise<PreviewAdmission | null> {
    const [row] = await this.sql.all<PreviewGenerationRow>(
      PREVIEW_REPLAY_SQL,
      input.actorId,
      input.idempotencyKey,
    );
    return row === undefined ? null : replay(row, input);
  }

  public async admitPreview(input: AdmitPreview): Promise<PreviewAdmission> {
    const plan = previewAdmissionPlan(input);
    if (plan === null) return { kind: "rejected", reason: "PREVIEW_RESOURCE_LIMIT" };
    const result = await this.execute(plan, input.now);
    if (result.kind === "rejected") return result.reason;
    const row = result.slots[PREVIEW_ADMITTED_ROW]?.[0] as PreviewGenerationRow;
    return { kind: "admitted", generation: generation(row) };
  }

  public async trackPreviewMedia(
    id: string,
    media: readonly MediaId[],
    now: UnixMilliseconds,
  ): Promise<boolean> {
    const set = previewMediaSet(media);
    return (
      set !== null &&
      (await this.execute(trackPreviewMediaPlan(id, set, now), now)).kind === "committed"
    );
  }

  public async sealPreviewInput(
    id: string,
    manifest: PreviewObject,
    now: UnixMilliseconds,
  ): Promise<boolean> {
    return (
      previewStoredObject(manifest) &&
      (await this.execute(sealPreviewInputPlan(id, manifest, now), now)).kind === "committed"
    );
  }

  public async failPreviewPreparation(
    id: string,
    reason: PreviewFailureReason,
    now: UnixMilliseconds,
  ): Promise<boolean> {
    return (
      (await this.execute(failPreviewPreparationPlan(id, reason, now), now)).kind === "committed"
    );
  }

  public async bindPreviewRun(id: string, run: string, now: UnixMilliseconds): Promise<boolean> {
    return (await this.execute(bindPreviewRunPlan(id, run), now)).kind === "committed";
  }

  public async dispatchedPreview(id: string, run: string): Promise<PreviewGeneration | null> {
    const [row] = await this.sql.all<PreviewGenerationRow>(
      `select ${GENERATION_COLUMNS} from preview_generations g
       join preview_execution_slot s on s.generation_id = g.id
       where g.id = ? and g.state = 'dispatched' and g.run_id = ?`,
      id,
      run,
    );
    return row === undefined ? null : generation(row);
  }

  public async hasPreviewExecutionSlot(): Promise<boolean> {
    return (
      (await this.sql.all("select 1 from preview_execution_slot where singleton_key = 1")).length >
      0
    );
  }

  public async activePreviewRun(
    now: UnixMilliseconds,
  ): Promise<(PreviewGeneration & { readonly run: string }) | null> {
    const [row] = await this.sql.all<PreviewGenerationRow & { run_id: string }>(
      `select ${GENERATION_COLUMNS},g.run_id from preview_execution_slot s
       join preview_generations g on s.generation_id = g.id
       where s.singleton_key = 1 and g.state in ('dispatched','running') and g.run_id is not null
         and g.overall_deadline > ? and (g.execution_deadline is null or g.execution_deadline > ?)`,
      now,
      now,
    );
    return row === undefined ? null : { ...generation(row), run: row.run_id };
  }

  public async failPreviewRun(
    id: string,
    run: string,
    reason: PreviewFailureReason,
    now: UnixMilliseconds,
  ): Promise<boolean> {
    return (
      isPreviewFailureReason(reason) &&
      (await this.execute(failPreviewRunPlan(id, run, reason, now), now)).kind === "committed"
    );
  }

  public async claimPreview(input: PreviewClaim): Promise<PreviewExecution | null> {
    if (!validPreviewClaim(input)) return null;
    const result = await this.execute(claimPreviewPlan(input), input.now);
    const row =
      result.kind === "committed"
        ? (result.slots[EXECUTION_ROW]?.[0] as PreviewExecutionRow | undefined)
        : undefined;
    return row === undefined ? null : execution(row);
  }

  public async runningPreview(input: PreviewClaim): Promise<PreviewExecution | null> {
    const { now } = input;
    const [row] = await this.sql.all<PreviewExecutionRow>(
      RUNNING_PREVIEW_SQL,
      ...claimParams(input),
      now,
      now,
      now,
    );
    return row === undefined ? null : execution(row);
  }

  public async finalizePreview(
    input: PreviewClaim & { readonly output: PreviewObject; readonly media: readonly MediaId[] },
  ): Promise<boolean> {
    if (!validPreviewClaim(input) || !previewStoredObject(input.output)) return false;
    const media = previewMediaSet(input.media);
    if (media === null) return false;
    const result = await this.execute(finalizePreviewPlan(input, media), input.now);
    if (result.kind === "committed") return true;
    return this.confirmedPreviewOutput(input);
  }

  public async confirmedPreviewOutput(input: PreviewClaim & { readonly output: PreviewObject }) {
    if (!validPreviewClaim(input) || !previewStoredObject(input.output)) return false;
    const lookup = finalizedPreviewRead(input);
    return (await this.sql.all(lookup.sql, ...lookup.params)).length > 0;
  }

  public async failPreview(
    id: string,
    reason: PreviewFailureReason,
    now: UnixMilliseconds,
    claim?: PreviewClaim,
  ): Promise<boolean> {
    if (!isPreviewFailureReason(reason) || (claim !== undefined && claim.id !== id)) return false;
    if (claim === undefined && (await this.failPreviewPreparation(id, reason, now))) return true;
    return (
      (await this.execute(failPreviewExecutionPlan(id, reason, now, claim), now)).kind ===
      "committed"
    );
  }

  public async settlePreviewDeadline(id: string, now: UnixMilliseconds): Promise<boolean> {
    return (await this.execute(settlePreviewDeadlinePlan(id, now), now)).kind === "committed";
  }

  public async duePreviewDeadlines(
    now: UnixMilliseconds,
    limit: number,
  ): Promise<readonly string[]> {
    const query = duePreviewDeadlinesSql(now, previewMaintenanceLimit(limit));
    return (await this.sql.all<{ id: string }>(query.sql, ...query.params)).map(({ id }) => id);
  }

  public async previewExecutorToStop(): Promise<PreviewStopTarget | null> {
    const [row] = await this.sql.all<PreviewGenerationRow & { run_id: string | null }>(
      PREVIEW_STOP_SQL,
    );
    return row === undefined
      ? null
      : {
          ...generation(row),
          ...(row.run_id === null ? {} : { run: row.run_id }),
        };
  }

  public async confirmPreviewExecutorStopped(id: string, now: UnixMilliseconds): Promise<boolean> {
    return (
      (await this.execute(confirmPreviewExecutorStoppedPlan(id, now), now)).kind === "committed"
    );
  }

  public async previewCleanup(
    now: UnixMilliseconds,
    limit: number,
  ): Promise<readonly PreviewCleanupItem[]> {
    const query = previewCleanupSql(now, previewMaintenanceLimit(limit));
    return (await this.sql.all<PreviewCleanupItem>(query.sql, ...query.params)).map(
      ({ id, scope }) => ({ id, scope }),
    );
  }

  public async recordPreviewPurged(
    item: PreviewCleanupItem,
    now: UnixMilliseconds,
  ): Promise<boolean> {
    return (await this.execute(recordPreviewPurgedPlan(item, now), now)).kind === "committed";
  }

  public async purgePreviewHistory(now: UnixMilliseconds, limit: number): Promise<number> {
    const result = await this.execute(
      purgePreviewHistoryPlan(now, previewMaintenanceLimit(limit)),
      now,
    );
    const row =
      result.kind === "committed"
        ? (result.slots[PREVIEW_PURGED_COUNT]?.[0] as { count: number } | undefined)
        : undefined;
    return row?.count ?? 0;
  }

  public async currentPreview(
    entryId: ContentEntryId,
    now: UnixMilliseconds,
  ): Promise<PreviewStatus | null> {
    const [row] = await this.sql.all<PreviewGenerationRow>(
      `select ${GENERATION_COLUMNS} from ${PREVIEW_CURRENT_JOIN} where c.entry_id = ?`,
      entryId,
    );
    if (row === undefined) return null;
    const status = generation(row);
    const timedOut =
      ["preparing", "dispatched", "running"].includes(row.state) &&
      (now >= row.overall_deadline ||
        (row.execution_deadline !== null && now >= row.execution_deadline));
    const expired = row.state === "ready" && row.expires_at !== null && now >= row.expires_at;
    return {
      id: status.id,
      revision: status.revision,
      createdAt: status.createdAt,
      state: timedOut ? "timed_out" : expired ? "expired" : status.state,
      ...(status.readyAt === undefined ? {} : { readyAt: status.readyAt }),
      ...(status.expiresAt === undefined ? {} : { expiresAt: status.expiresAt }),
      ...(timedOut
        ? { reason: "PREVIEW_TIMED_OUT" }
        : status.reason === undefined
          ? {}
          : { reason: status.reason }),
    };
  }

  public async readyPreview(id: string, now: UnixMilliseconds): Promise<PreviewObject | null> {
    const [row] = await this.sql.all<PreviewObject>(
      `select g.output_sha256 as sha256, g.output_bytes as bytes
       from preview_generations g join preview_current c on c.entry_id = g.entry_id and c.generation_id = g.id
       where g.id = ? and g.state = 'ready' and g.expires_at > ? and g.output_sha256 is not null`,
      id,
      now,
    );
    return row ?? null;
  }

  public async capturedPreviewTarget(id: string): Promise<PreviewTarget | null> {
    const [row] = await this.sql.all<{
      title: string;
      slug: string | null;
      fields_json: string;
      seo_json: string | null;
      links_json: string;
    }>(
      `select t.title,t.slug,t.fields_json,t.seo_json,t.links_json
       from preview_targets t join preview_generations g on g.id = t.generation_id
       where t.generation_id = ? and g.state = 'preparing'`,
      id,
    );
    if (row === undefined) return null;
    const [blocks, media] = await Promise.all([
      this.sql.all<BlockRow>(
        `select generation_id as snapshot_id,block_key,block_type,position,schema_version,data_json,
          created_at,updated_at,anchor,class_name,0 as hidden,settings_json
         from preview_target_blocks where generation_id = ? order by position`,
        id,
      ),
      this.sql.all<Record<string, unknown>>(
        `select ${MEDIA_COLUMNS_SQL}
         from preview_media_dependencies d join media m on m.id = d.media_id and m.status = 'active'
         where d.generation_id = ? and d.target = 1 order by m.id`,
        id,
      ),
    ]);
    return {
      title: row.title,
      ...(row.slug === null ? {} : { slug: row.slug }),
      fields: parseObject(row.fields_json, "Preview target fields"),
      ...(row.seo_json === null ? {} : { seo: parseObject(row.seo_json, "Preview target SEO") }),
      blocks: blocks.map(storedBlock),
      media: media.map(mediaMetadata),
      internalLinks: JSON.parse(row.links_json) as PreviewTarget["internalLinks"],
    };
  }
}
