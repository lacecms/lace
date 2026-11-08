import type { ListMediaTagsInput, MediaTagCount } from "@lacecms/application";
import type {
  ActorSummary,
  ApplyConfigurationSynchronizationInput,
  ApplyConfigurationSynchronizationResult,
  BuildContentExportPage,
  BuildQueueReceipt,
  ClaimDispatcherEventsInput,
  CompleteDispatcherLeaseInput,
  ApplyConfigurationSyncBlockMigrationsInput,
  ConfigurationSyncApplyPort,
  ConfigurationSyncMigrationCounts,
  ConfigurationSyncMigrationPage,
  ConfigurationSyncMigrationScanInput,
  ConfigurationSyncSnapshotPage,
  ConfigurationSyncSnapshotScanInput,
  ConfigurationSyncStateReadPort,
  ContentCommandResult,
  ContentLinkReadPort,
  ContentEntryCommandPort,
  ContentEntryListPage,
  ContentEntryReadPort,
  CreateContentEntryInput,
  CreateMediaMetadataInput,
  CursorPage,
  DeleteContentEntryInput,
  DispatcherLease,
  DispatcherLeaseId,
  DispatcherLeasePort,
  EnqueueSiteBuildInput,
  ListContentEntriesInput,
  ListMediaInput,
  ExportBuildContentPageInput,
  ListPublicContentInput,
  LoadContentEntryInput,
  LoadMediaUsageInput,
  MarkMediaForDeletionInput,
  MarkMediaForDeletionResult,
  MediaCatalogItem,
  MediaCatalogPort,
  MediaCommandPort,
  MediaDeletionDispatchPort,
  MediaListPort,
  MediaReadPort,
  MediaUsageEntry,
  PublicContentEntry,
  PublicGlobalContent,
  PublicContentReadPort,
  PublishContentEntryCommand,
  PublishContentEntryResult,
  RetryDispatcherLeaseInput,
  RevertContentDraftCommand,
  SaveCompleteDraftInput,
  UnpublishContentEntryCommand,
  UnpublishContentEntryResult,
  UpdateMediaMetadataInput,
  UpdateMediaMetadataResult,
  SiteBuildCommandPort,
  SiteBuildDispatchPort,
  SiteBuildReadPort,
  SiteBuildRecord,
  SiteBuildWorkLease,
  TrackedSiteBuildCheck,
  StoredContentModelState,
} from "@lacecms/application";
import { SqlContentReader } from "@lacecms/db";
import type { ContentModelResolver } from "@lacecms/db";
import type {
  ActorId,
  ContentEntry,
  ContentModelKey,
  DraftSnapshot,
  MediaMetadata,
  PublishedSnapshot,
  SiteBuildId,
  SiteBuildProviderStage,
  TrackedSiteBuildOutcome,
  UnixMilliseconds,
} from "@lacecms/domain";
import { type D1Database } from "../d1/database.js";
import { d1ContentReadSql } from "./sql.js";
import type { D1RepositoryOptions } from "./base.js";
import { D1CollectionList } from "./collection-list.js";
import { D1ConfigurationSync } from "./configuration-sync.js";
import { D1DispatcherLeases } from "./dispatch.js";
import { D1EntryCommands } from "./entries.js";
import { D1MediaCommands } from "./media.js";
import { D1SiteBuilds } from "./site-builds.js";

export type { D1RepositoryOptions } from "./base.js";

/**
 * Cloudflare D1 implementation of the portable content persistence ports.
 * Multi-row mutations are single guarded `batch()` calls; no statement relies
 * on an interactive transaction.
 */
export class D1ContentRepository
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
  private readonly configurationSync: D1ConfigurationSync;
  private readonly collectionList: D1CollectionList;
  private readonly entries: D1EntryCommands;
  private readonly media: D1MediaCommands;
  private readonly dispatch: D1DispatcherLeases;
  private readonly siteBuilds: D1SiteBuilds;

  private readonly reader: SqlContentReader;

  public constructor(
    database: D1Database,
    resolveModel: ContentModelResolver,
    options: D1RepositoryOptions = {},
  ) {
    this.reader = new SqlContentReader(d1ContentReadSql(database), resolveModel);
    const parts = [database, resolveModel, options, this.reader] as const;
    this.configurationSync = new D1ConfigurationSync(...parts);
    this.collectionList = new D1CollectionList(...parts);
    this.entries = new D1EntryCommands(...parts);
    this.media = new D1MediaCommands(...parts);
    this.dispatch = new D1DispatcherLeases(...parts);
    this.siteBuilds = new D1SiteBuilds(...parts);
  }

  // ---------------------------------------------------------------- reads

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
    return this.collectionList.list(input);
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

  public async loadDeletingMedia(id: string): Promise<MediaMetadata | null> {
    return this.reader.loadDeletingMedia(id);
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

  public async getSiteBuild(buildId: SiteBuildId): Promise<SiteBuildRecord | null> {
    return this.reader.getSiteBuild(buildId);
  }

  // ------------------------------------------------------- entry mutations

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

  public async delete(input: DeleteContentEntryInput): Promise<ContentCommandResult> {
    return this.entries.delete(input);
  }

  public async applyConfigurationSynchronization(
    input: ApplyConfigurationSynchronizationInput,
  ): Promise<ApplyConfigurationSynchronizationResult> {
    return this.configurationSync.applyConfigurationSynchronization(input);
  }

  // ------------------------------------------------------- media mutations

  public async createMedia(input: CreateMediaMetadataInput): Promise<MediaMetadata> {
    return this.media.createMedia(input);
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

  public async completeMediaDeletion(input: {
    readonly completedAt: UnixMilliseconds;
    readonly leaseId: DispatcherLeaseId;
    readonly mediaId: string;
  }): Promise<void> {
    return this.media.completeMediaDeletion(input);
  }

  public async failMediaDeletion(input: {
    readonly failedAt: UnixMilliseconds;
    readonly leaseId: DispatcherLeaseId;
    readonly mediaId: string;
    readonly sanitizedError: string;
    readonly terminal: boolean;
    readonly retryAt?: UnixMilliseconds;
  }): Promise<void> {
    return this.media.failMediaDeletion(input);
  }

  // ---------------------------------------------------------- dispatching

  public async claim(input: ClaimDispatcherEventsInput): Promise<readonly DispatcherLease[]> {
    return this.dispatch.claim(input);
  }

  public async complete(input: CompleteDispatcherLeaseInput): Promise<void> {
    return this.dispatch.complete(input);
  }

  public async retry(input: RetryDispatcherLeaseInput): Promise<void> {
    return this.dispatch.retry(input);
  }

  public async requestBuild(input: EnqueueSiteBuildInput): Promise<BuildQueueReceipt> {
    return this.siteBuilds.requestBuild(input);
  }

  public async claimSiteBuilds(input: {
    readonly limit: number;
    readonly now: UnixMilliseconds;
  }): Promise<readonly SiteBuildWorkLease[]> {
    return this.siteBuilds.claimSiteBuilds(input);
  }

  public async renewSiteBuildLease(input: {
    readonly leaseId: DispatcherLeaseId;
    readonly now: UnixMilliseconds;
  }): Promise<boolean> {
    return this.siteBuilds.renewSiteBuildLease(input);
  }

  public async recordSiteBuildAccepted(input: {
    readonly leaseId: DispatcherLeaseId;
    readonly now: UnixMilliseconds;
    readonly providerBuildId?: string;
  }): Promise<void> {
    return this.siteBuilds.recordSiteBuildAccepted(input);
  }

  public async recordSiteBuildTracking(input: {
    readonly leaseId: DispatcherLeaseId;
    readonly now: UnixMilliseconds;
    readonly providerBuildId: string;
  }): Promise<void> {
    return this.siteBuilds.recordSiteBuildTracking(input);
  }

  public async recordSiteBuildSuccess(input: {
    readonly leaseId: DispatcherLeaseId;
    readonly now: UnixMilliseconds;
  }): Promise<void> {
    return this.siteBuilds.recordSiteBuildSuccess(input);
  }

  public async recordSiteBuildFailure(input: {
    readonly leaseId: DispatcherLeaseId;
    readonly now: UnixMilliseconds;
    readonly reason: string;
    readonly path?: string;
    readonly retryAt?: UnixMilliseconds;
    readonly terminal: boolean;
  }): Promise<void> {
    return this.siteBuilds.recordSiteBuildFailure(input);
  }

  public async completeTrackedSiteBuild(input: {
    readonly buildId: SiteBuildId;
    readonly providerBuildId: string;
    readonly now: UnixMilliseconds;
    readonly outcome: TrackedSiteBuildOutcome;
    readonly reason?: string;
    readonly stage?: SiteBuildProviderStage;
  }): Promise<void> {
    return this.siteBuilds.completeTrackedSiteBuild(input);
  }

  public async claimTrackedSiteBuildChecks(input: {
    readonly limit: number;
    readonly leaseMs: number;
    readonly now: UnixMilliseconds;
  }): Promise<readonly TrackedSiteBuildCheck[]> {
    return this.siteBuilds.claimTrackedSiteBuildChecks(input);
  }

  public async recordTrackedSiteBuildCheck(input: {
    readonly buildId: SiteBuildId;
    readonly providerBuildId: string;
    readonly now: UnixMilliseconds;
    readonly checkAfter: UnixMilliseconds;
    readonly stage?: SiteBuildProviderStage;
  }): Promise<boolean> {
    return this.siteBuilds.recordTrackedSiteBuildCheck(input);
  }

  public async updateMediaMetadata(
    input: UpdateMediaMetadataInput,
  ): Promise<UpdateMediaMetadataResult> {
    return this.media.updateMediaMetadata(input);
  }
}

export function d1ContentRepository(
  database: D1Database,
  resolveModel: ContentModelResolver,
  options?: D1RepositoryOptions,
): D1ContentRepository {
  return new D1ContentRepository(database, resolveModel, options);
}
