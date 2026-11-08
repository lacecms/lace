import type { ListMediaTagsInput, MediaTagCount } from "@lacecms/application";
import { collectionListPlan } from "@lacecms/db";
import { NODE_LIST_QUERY_LIMITS } from "@lacecms/content";
import type { CollectionListRow } from "@lacecms/db";
import type {
  ActorSummary,
  ApplyConfigurationSynchronizationInput,
  ApplyConfigurationSynchronizationResult,
  BuildContentExportPage,
  ClaimDispatcherEventsInput,
  CompleteDispatcherLeaseInput,
  ContentCommandResult,
  ContentLinkReadPort,
  ContentEntryCommandPort,
  ContentEntryListPage,
  ContentEntryReadPort,
  ApplyConfigurationSyncBlockMigrationsInput,
  ConfigurationSyncApplyPort,
  ConfigurationSyncMigrationCounts,
  ConfigurationSyncMigrationPage,
  ConfigurationSyncMigrationScanInput,
  ConfigurationSyncSnapshotPage,
  ConfigurationSyncSnapshotScanInput,
  ConfigurationSyncStateReadPort,
  CreateContentEntryInput,
  CreateMediaMetadataInput,
  CursorPage,
  DispatcherLease,
  DispatcherLeasePort,
  ExportBuildContentPageInput,
  ListContentEntriesInput,
  ListMediaInput,
  LoadMediaUsageInput,
  MediaCatalogItem,
  MediaCatalogPort,
  ListPublicContentInput,
  LoadContentEntryInput,
  MarkMediaForDeletionInput,
  MarkMediaForDeletionResult,
  MediaCommandPort,
  MediaDeletionDispatchPort,
  MediaListPort,
  MediaReadPort,
  MediaUsageEntry,
  PublishContentEntryCommand,
  PublishContentEntryResult,
  PublicContentEntry,
  PublicGlobalContent,
  PublicContentReadPort,
  RevertContentDraftCommand,
  SaveCompleteDraftInput,
  RetryDispatcherLeaseInput,
  UnpublishContentEntryCommand,
  UnpublishContentEntryResult,
  UpdateMediaMetadataInput,
  UpdateMediaMetadataResult,
  BuildQueueReceipt,
  EnqueueSiteBuildInput,
  SiteBuildCommandPort,
  SiteBuildReadPort,
  SiteBuildRecord,
  SiteBuildDispatchPort,
  SiteBuildWorkLease,
  StoredContentModelState,
} from "@lacecms/application";
import { SqlContentReader } from "@lacecms/db";
import type { ContentModelResolver, TotalsRow } from "@lacecms/db";
import type {
  ActorId,
  ContentEntry,
  ContentModelKey,
  DraftSnapshot,
  MediaMetadata,
  PublishedSnapshot,
} from "@lacecms/domain";
import type Database from "better-sqlite3";
import type { NodeDatabase } from "../database/connection.js";
import { nodeContentReadSql } from "./sql.js";
import type { NodeRepositoryOptions } from "./base.js";
import { NodeConfigurationSync } from "./configuration-sync.js";
import { NodeDispatcherLeases } from "./dispatch.js";
import { NodeEntryCommands } from "./entries.js";
import { NodeMediaCommands } from "./media.js";
import { NodeSiteBuilds } from "./site-builds.js";

export type { NodeRepositoryOptions } from "./base.js";

export type { ContentModelResolver } from "@lacecms/db";

/**
 * Node SQLite implementation of bounded content reads plus draft creation and
 * replacement. Guarded publication and deletion intentionally belong to 5C.
 */
export class NodeContentRepository
  implements
    ContentLinkReadPort,
    ContentEntryCommandPort,
    ContentEntryReadPort,
    ConfigurationSyncApplyPort,
    ConfigurationSyncStateReadPort,
    DispatcherLeasePort,
    MediaCommandPort,
    MediaCatalogPort,
    MediaDeletionDispatchPort,
    MediaListPort,
    MediaReadPort,
    PublicContentReadPort,
    SiteBuildCommandPort,
    SiteBuildReadPort,
    SiteBuildDispatchPort
{
  private readonly configurationSync: NodeConfigurationSync;
  private readonly entries: NodeEntryCommands;
  private readonly media: NodeMediaCommands;
  private readonly dispatch: NodeDispatcherLeases;
  private readonly siteBuilds: NodeSiteBuilds;

  private readonly reader: SqlContentReader;

  public constructor(
    private readonly connection: Database.Database,
    resolveModel: ContentModelResolver,
    options: NodeRepositoryOptions = {},
  ) {
    this.reader = new SqlContentReader(nodeContentReadSql(connection), resolveModel);
    const parts = [connection, resolveModel, options, this.reader] as const;
    this.configurationSync = new NodeConfigurationSync(...parts);
    this.entries = new NodeEntryCommands(...parts);
    this.media = new NodeMediaCommands(...parts);
    this.dispatch = new NodeDispatcherLeases(...parts);
    this.siteBuilds = new NodeSiteBuilds(...parts);
  }

  public resolveLinkTargets(ids: readonly string[]) {
    return this.reader.resolveLinkTargets(ids);
  }
  public listLinkTargets(input: import("@lacecms/application").LinkTargetQuery) {
    return this.reader.listLinkTargets(input);
  }
  public readLinkImpact(
    input: import("@lacecms/application").LinkImpactQuery & { readonly actorId: string },
  ) {
    return this.reader.readLinkImpact(input);
  }

  public async readConfigurationSyncState(): Promise<readonly StoredContentModelState[]> {
    return this.configurationSync.readConfigurationSyncState();
  }

  public async readConfigurationSyncSnapshots(
    input: ConfigurationSyncSnapshotScanInput,
  ): Promise<ConfigurationSyncSnapshotPage> {
    return this.configurationSync.readConfigurationSyncSnapshots(input);
  }

  public async readConfigurationSyncMigrationEntries(
    input: ConfigurationSyncMigrationScanInput,
  ): Promise<ConfigurationSyncMigrationPage> {
    return this.configurationSync.readConfigurationSyncMigrationEntries(input);
  }

  public async applyConfigurationSyncBlockMigrations(
    input: ApplyConfigurationSyncBlockMigrationsInput,
  ): Promise<ConfigurationSyncMigrationCounts> {
    return this.configurationSync.applyConfigurationSyncBlockMigrations(input);
  }

  public async applyConfigurationSynchronization(
    input: ApplyConfigurationSynchronizationInput,
  ): Promise<ApplyConfigurationSynchronizationResult> {
    return this.configurationSync.applyConfigurationSynchronization(input);
  }

  public async create(input: CreateContentEntryInput): Promise<ContentCommandResult> {
    return this.entries.create(input);
  }

  public async saveCompleteDraft(input: SaveCompleteDraftInput): Promise<ContentCommandResult> {
    return this.entries.saveCompleteDraft(input);
  }

  public async publish(input: PublishContentEntryCommand): Promise<PublishContentEntryResult> {
    return this.entries.publish(input);
  }

  public async unpublish(
    input: UnpublishContentEntryCommand,
  ): Promise<UnpublishContentEntryResult> {
    return this.entries.unpublish(input);
  }

  public async revertDraft(input: RevertContentDraftCommand): Promise<ContentCommandResult> {
    return this.entries.revertDraft(input);
  }

  public async delete(
    input: import("@lacecms/application").DeleteContentEntryInput,
  ): Promise<ContentCommandResult> {
    return this.entries.delete(input);
  }

  public async markForDeletion(
    input: MarkMediaForDeletionInput,
  ): Promise<MarkMediaForDeletionResult> {
    return this.media.markForDeletion(input);
  }

  public async retryDeletion(
    input: MarkMediaForDeletionInput,
  ): Promise<MarkMediaForDeletionResult> {
    return this.media.retryDeletion(input);
  }

  public async updateMediaMetadata(
    input: UpdateMediaMetadataInput,
  ): Promise<UpdateMediaMetadataResult> {
    return this.media.updateMediaMetadata(input);
  }

  public async claim(input: ClaimDispatcherEventsInput): Promise<readonly DispatcherLease[]> {
    return this.dispatch.claim(input);
  }

  public async complete(input: CompleteDispatcherLeaseInput): Promise<void> {
    return this.dispatch.complete(input);
  }

  public async retry(input: RetryDispatcherLeaseInput): Promise<void> {
    return this.dispatch.retry(input);
  }

  public async loadDeletingMedia(id: string): Promise<MediaMetadata | null> {
    return this.reader.loadDeletingMedia(id);
  }

  public async completeMediaDeletion(input: {
    readonly completedAt: number;
    readonly leaseId: string;
    readonly mediaId: string;
  }): Promise<void> {
    return this.media.completeMediaDeletion(input);
  }

  public async failMediaDeletion(input: {
    readonly failedAt: number;
    readonly leaseId: string;
    readonly mediaId: string;
    readonly sanitizedError: string;
    readonly terminal: boolean;
    readonly retryAt?: number;
  }): Promise<void> {
    return this.media.failMediaDeletion(input);
  }

  public async createMedia(input: CreateMediaMetadataInput): Promise<MediaMetadata> {
    return this.media.createMedia(input);
  }

  public async load(input: LoadContentEntryInput): Promise<ContentEntry | null> {
    return this.reader.load(input);
  }

  public async loadDraft(input: LoadContentEntryInput): Promise<DraftSnapshot | null> {
    return this.reader.loadDraft(input);
  }

  public async loadPublished(input: LoadContentEntryInput): Promise<PublishedSnapshot | null> {
    return this.reader.loadPublished(input);
  }

  public async describeActors(ids: readonly ActorId[]): Promise<readonly ActorSummary[]> {
    return this.reader.describeActors(ids);
  }

  public async list(input: ListContentEntriesInput): Promise<ContentEntryListPage> {
    const plan = await collectionListPlan({ ...input, listQueryLimits: NODE_LIST_QUERY_LIMITS });
    const rows = this.connection
      .prepare(plan.items.sql)
      .all(
        Object.fromEntries(plan.items.params.map((value, index) => [String(index + 1), value])),
      ) as readonly CollectionListRow[];
    const totals = this.connection
      .prepare(plan.totals.sql)
      .get(
        Object.fromEntries(plan.totals.params.map((value, index) => [String(index + 1), value])),
      ) as TotalsRow;
    return plan.page(rows, totals);
  }

  public async listPublic(input: ListPublicContentInput): Promise<CursorPage<PublicContentEntry>> {
    return this.reader.listPublic(input);
  }

  public async publishedContentVersion(): Promise<number> {
    return this.reader.publishedContentVersion();
  }

  public async loadPublic(path: string): Promise<PublicContentEntry | null> {
    return this.reader.loadPublic(path);
  }

  public async loadPublicGlobal(modelKey: ContentModelKey): Promise<PublicGlobalContent | null> {
    return this.reader.loadPublicGlobal(modelKey);
  }

  public async loadPublicMedia(id: string): Promise<MediaMetadata | null> {
    return this.reader.loadPublicMedia(id);
  }

  public async loadMediaMany(ids: readonly string[]): Promise<readonly MediaMetadata[]> {
    return this.reader.loadMediaMany(ids);
  }

  public async loadMedia(id: string): Promise<MediaMetadata | null> {
    return this.reader.loadMedia(id);
  }

  public async listMedia(input: ListMediaInput): Promise<CursorPage<MediaCatalogItem>> {
    return this.reader.listMedia(input);
  }

  public async listMediaTags(input: ListMediaTagsInput): Promise<CursorPage<MediaTagCount>> {
    return this.reader.listMediaTags(input);
  }

  public async loadMediaCatalogItem(id: string): Promise<MediaCatalogItem | null> {
    return this.reader.loadMediaCatalogItem(id);
  }

  public async loadMediaUsage(input: LoadMediaUsageInput): Promise<readonly MediaUsageEntry[]> {
    return this.reader.loadMediaUsage(input);
  }

  public async exportBuildContentPage(
    input: ExportBuildContentPageInput,
  ): Promise<BuildContentExportPage> {
    return this.reader.exportBuildContentPage(input);
  }

  public async listSiteBuilds(limit: number): Promise<readonly SiteBuildRecord[]> {
    return this.reader.listSiteBuilds(limit);
  }

  public async getSiteBuild(
    buildId: import("@lacecms/domain").SiteBuildId,
  ): Promise<SiteBuildRecord | null> {
    return this.reader.getSiteBuild(buildId);
  }

  public async requestBuild(input: EnqueueSiteBuildInput): Promise<BuildQueueReceipt> {
    return this.siteBuilds.requestBuild(input);
  }

  public async claimSiteBuilds(input: {
    readonly limit: number;
    readonly now: import("@lacecms/domain").UnixMilliseconds;
  }): Promise<readonly SiteBuildWorkLease[]> {
    return this.siteBuilds.claimSiteBuilds(input);
  }

  public async renewSiteBuildLease(input: {
    readonly leaseId: import("@lacecms/application").DispatcherLeaseId;
    readonly now: import("@lacecms/domain").UnixMilliseconds;
  }): Promise<boolean> {
    return this.siteBuilds.renewSiteBuildLease(input);
  }

  public async recordSiteBuildAccepted(input: {
    readonly leaseId: import("@lacecms/application").DispatcherLeaseId;
    readonly now: import("@lacecms/domain").UnixMilliseconds;
    readonly providerBuildId?: string;
  }): Promise<void> {
    return this.siteBuilds.recordSiteBuildAccepted(input);
  }

  public async recordSiteBuildTracking(input: {
    readonly leaseId: import("@lacecms/application").DispatcherLeaseId;
    readonly now: import("@lacecms/domain").UnixMilliseconds;
    readonly providerBuildId: string;
  }): Promise<void> {
    return this.siteBuilds.recordSiteBuildTracking(input);
  }

  public async recordSiteBuildSuccess(input: {
    readonly leaseId: import("@lacecms/application").DispatcherLeaseId;
    readonly now: import("@lacecms/domain").UnixMilliseconds;
  }): Promise<void> {
    return this.siteBuilds.recordSiteBuildSuccess(input);
  }

  public async recordSiteBuildFailure(input: {
    readonly leaseId: import("@lacecms/application").DispatcherLeaseId;
    readonly now: import("@lacecms/domain").UnixMilliseconds;
    readonly reason: string;
    readonly path?: string;
    readonly retryAt?: import("@lacecms/domain").UnixMilliseconds;
    readonly terminal: boolean;
  }): Promise<void> {
    return this.siteBuilds.recordSiteBuildFailure(input);
  }

  public async completeTrackedSiteBuild(input: {
    readonly buildId: import("@lacecms/domain").SiteBuildId;
    readonly providerBuildId: string;
    readonly now: import("@lacecms/domain").UnixMilliseconds;
    readonly outcome: import("@lacecms/domain").TrackedSiteBuildOutcome;
    readonly reason?: string;
    readonly stage?: import("@lacecms/domain").SiteBuildProviderStage;
  }): Promise<void> {
    return this.siteBuilds.completeTrackedSiteBuild(input);
  }

  public async claimTrackedSiteBuildChecks(input: {
    readonly limit: number;
    readonly leaseMs: number;
    readonly now: import("@lacecms/domain").UnixMilliseconds;
  }): Promise<readonly import("@lacecms/application").TrackedSiteBuildCheck[]> {
    return this.siteBuilds.claimTrackedSiteBuildChecks(input);
  }

  public async recordTrackedSiteBuildCheck(input: {
    readonly buildId: import("@lacecms/domain").SiteBuildId;
    readonly providerBuildId: string;
    readonly now: import("@lacecms/domain").UnixMilliseconds;
    readonly checkAfter: import("@lacecms/domain").UnixMilliseconds;
    readonly stage?: import("@lacecms/domain").SiteBuildProviderStage;
  }): Promise<boolean> {
    return this.siteBuilds.recordTrackedSiteBuildCheck(input);
  }
}

export function nodeContentRepository(
  database: NodeDatabase,
  resolveModel: ContentModelResolver,
  options?: NodeRepositoryOptions,
): NodeContentRepository {
  return new NodeContentRepository(database.connection, resolveModel, options);
}
