import {
  type AccountCapabilitiesDto,
  type OAuthConnectionListDto,
  type McpConsentDetailsDto,
  type McpConsentNavigationDto,
  type CollectionFieldFilterDto,
  type AccountSessionListDto,
  type AdminPasswordResetResultDto,
  type AdminSessionDto,
  type InvitationAcceptResultDto,
  type InvitationInspectResultDto,
  type InvitationIssueResultDto,
  type InvitationListDto,
  type SessionRevocationResultDto,
  type BuildSiteSelectionDto,
  type SetupStateDto,
  type EmailTestResultDto,
  type MediaTagCatalogDto,
  type ContentBlockDto,
  type AdminSettingsStatusDto,
  type BuildTokenCreatedDto,
  type BuildTokenDto,
  type BuildTokenListDto,
  type ImportTokenCreatedDto,
  type ImportTokenDto,
  type ImportTokenListDto,
  type BuildQueueReceiptDto,
  type SiteBuildRecordDto,
  type SiteBuildListDto,
  type AdminContentEntryDto,
  type ContentEntrySortDto,
  type ContentEntryStatusDto,
  type ContentEntryListDto,
  type ContentModelListDto,
  type MediaDetailDto,
  type MediaListDto,
  type MediaMetadataDto,
  type MediaMimeTypeDto,
  type MediaSortDto,
  type ManagedUserDto,
  type ManagedUserListDto,
  type PublishContentEntryResultDto,
  type SeoInputDto,
  type UnpublishContentEntryResultDto,
  type UpdateMediaMetadataRequestDto,
  type UpdateMediaMetadataResultDto,
} from "@lacecms/contracts";
import {
  type LinkTargetPageDto,
  type LinkTargetStatusesDto,
  type LinkImpactPageDto,
  type LinkImpactAcknowledgmentDto,
} from "@lacecms/contracts";
import { type MediaUploadOptions } from "./admin-transport.js";
import type { ListQueryLimits } from "@lacecms/contracts";

export interface AdminClient {
  loadSetupState(): Promise<SetupStateDto>;
  setupAdmin(input: { email: string; password: string; token: string }): Promise<void>;
  loadBuildSite(): Promise<BuildSiteSelectionDto>;
  listBuilds(): Promise<SiteBuildListDto>;
  getBuild(buildId: string): Promise<SiteBuildRecordDto>;
  requestBuild(): Promise<BuildQueueReceiptDto>;
  retryBuild(buildId: string): Promise<BuildQueueReceiptDto>;
  updateUser(
    userId: string,
    input: { disabled?: boolean; role?: "admin" | "editor" | "viewer" },
  ): Promise<ManagedUserDto>;
  listUsers(): Promise<ManagedUserListDto>;
  /** Ends every session of another account and reports how many ended. */
  signOutUser(userId: string): Promise<SessionRevocationResultDto>;
  /** Issues a reset for another account; the link is present only when the email was not sent. */
  sendPasswordReset(userId: string): Promise<AdminPasswordResetResultDto>;
  listInvitations(): Promise<InvitationListDto>;
  /** Invites an address; the link is present only when the email was not sent. */
  createInvitation(input: {
    email: string;
    role: "admin" | "editor" | "viewer";
  }): Promise<InvitationIssueResultDto>;
  resendInvitation(invitationId: string): Promise<InvitationIssueResultDto>;
  revokeInvitation(invitationId: string): Promise<void>;
  /** Public: reads the invited email, role and expiry for a fragment token. */
  inspectInvitation(token: string): Promise<InvitationInspectResultDto>;
  /** Public: creates the invited account; it does not sign in. */
  acceptInvitation(input: {
    displayName?: string;
    password: string;
    token: string;
  }): Promise<InvitationAcceptResultDto>;
  /** Public: always resolves the same way whether or not the address has an account. */
  requestPasswordReset(email: string): Promise<void>;
  /** Public: replaces the password for a fragment token and ends every session. */
  confirmPasswordReset(input: { password: string; token: string }): Promise<void>;
  /** Renames the signed-in user and returns the updated session summary. */
  updateProfile(input: { displayName: string }): Promise<AdminSessionDto>;
  changePassword(input: {
    currentPassword: string;
    newPassword: string;
    signOutOtherSessions: boolean;
  }): Promise<SessionRevocationResultDto>;
  loadAccountCapabilities(): Promise<AccountCapabilitiesDto>;
  listMcpConnections(after?: string): Promise<OAuthConnectionListDto>;
  revokeMcpConnection(id: string): Promise<void>;
  loadMcpConsent(transaction: string): Promise<McpConsentDetailsDto>;
  submitMcpConsent(input: {
    transaction: string;
    accept: boolean;
    scope: string;
  }): Promise<McpConsentNavigationDto>;
  listSessions(): Promise<AccountSessionListDto>;
  deleteSession(sessionId: string): Promise<void>;
  revokeOtherSessions(): Promise<SessionRevocationResultDto>;
  loadSettingsStatus(): Promise<AdminSettingsStatusDto>;
  /** Sends the fixed test message to the signed-in administrator's own address. */
  sendTestEmail(): Promise<EmailTestResultDto>;
  listTokens(): Promise<BuildTokenListDto>;
  createToken(name: string): Promise<BuildTokenCreatedDto>;
  revokeToken(tokenId: string): Promise<BuildTokenDto>;
  listImportTokens(): Promise<ImportTokenListDto>;
  createImportToken(input: {
    readonly allowPublish: boolean;
    readonly expiresInDays: number;
    readonly name: string;
  }): Promise<ImportTokenCreatedDto>;
  revokeImportToken(tokenId: string): Promise<ImportTokenDto>;
  createEntry(modelKey: string, title: string, slug?: string): Promise<AdminContentEntryDto>;
  deleteEntry(
    entryId: string,
    expectedRevision: number,
    linkImpact?: LinkImpactAcknowledgmentDto,
  ): Promise<void>;
  listLinkTargets(
    query: {
      readonly search?: string;
      readonly status?: "published" | "unpublished";
      readonly after?: string;
      readonly limit?: number;
    },
    signal?: AbortSignal,
  ): Promise<LinkTargetPageDto>;
  resolveLinkTargets(ids: readonly string[], signal?: AbortSignal): Promise<LinkTargetStatusesDto>;
  linkImpact(
    entryId: string,
    query: {
      readonly action: "delete" | "unpublish";
      readonly after?: string;
      readonly sourceEntryId?: string;
      readonly snapshotId?: string;
      readonly locationsAfter?: string;
      readonly limit?: number;
    },
    signal?: AbortSignal,
  ): Promise<LinkImpactPageDto>;
  loadEntry(entryId: string): Promise<AdminContentEntryDto>;
  listEntries(
    modelKey: string,
    cursor?: string,
    query?: EntryListQuery,
  ): Promise<ContentEntryListDto>;
  listMedia(cursor?: string, query?: MediaListQuery): Promise<MediaListDto>;
  listMediaTags(query?: {
    q?: string;
    after?: string;
    limit?: number;
  }): Promise<MediaTagCatalogDto>;
  getMedia(mediaId: string): Promise<MediaDetailDto>;
  uploadMedia(file: File, options?: MediaUploadOptions): Promise<MediaMetadataDto>;
  /** With `detachDrafts`, the server first removes the item from every using draft. */
  deleteMedia(
    mediaId: string,
    options?: { readonly detachDrafts?: boolean },
  ): Promise<MediaMetadataDto>;
  retryMediaDeletion(mediaId: string): Promise<MediaMetadataDto>;
  /**
   * Changes descriptive metadata, guarded by the `updatedAt` of the item the
   * caller edited; a newer version fails with `MEDIA_UPDATE_CONFLICT`.
   */
  updateMediaMetadata(
    mediaId: string,
    patch: UpdateMediaMetadataRequestDto,
    expectedUpdatedAt: string,
  ): Promise<UpdateMediaMetadataResultDto>;
  listModels(): Promise<ContentModelListDto>;
  publishEntry(
    entryId: string,
    input: { readonly expectedRevision: number; readonly idempotencyKey: string },
  ): Promise<PublishContentEntryResultDto>;
  /** Removes the publication guarded by the snapshot the caller displays; keeps the draft. */
  unpublishEntry(
    entryId: string,
    input: {
      readonly expectedPublishedSnapshotId: string;
      readonly idempotencyKey: string;
      readonly linkImpact?: LinkImpactAcknowledgmentDto;
    },
  ): Promise<UnpublishContentEntryResultDto>;
  /** Replaces the draft with the current publication. */
  revertEntry(entryId: string, expectedRevision: number): Promise<AdminContentEntryDto>;
  /** Creates an unpublished copy of a collection entry's saved draft. */
  duplicateEntry(entryId: string, expectedRevision: number): Promise<AdminContentEntryDto>;
  signIn(email: string, password: string): Promise<void>;
  signOut(): Promise<void>;
  saveDraft(
    entryId: string,
    input: {
      readonly blocks: readonly ContentBlockDto[];
      readonly expectedRevision: number;
      readonly fields: Record<string, unknown>;
      /** Sent back unchanged until the editor offers SEO inputs. */
      readonly seo?: SeoInputDto;
      readonly slug?: string;
      readonly title: string;
    },
  ): Promise<AdminContentEntryDto>;
}

/** The entry-list order the API applies when no sort is requested. */
export const DEFAULT_ENTRY_SORT: ContentEntrySortDto = "-updatedAt";

/** Server-side search, status filter, and sort for an admin entry list. */
export interface EntryListQuery {
  readonly listQueryLimits?: ListQueryLimits;
  readonly filters?: readonly CollectionFieldFilterDto[];
  /** Effective model query capabilities; cache identity only, never sent to the API. */
  readonly capabilities?: string;
  readonly limit?: number;
  readonly q?: string;
  readonly sort?: ContentEntrySortDto;
  readonly status?: ContentEntryStatusDto;
}

/** The media-list order the API applies when no sort is requested. */
export const DEFAULT_MEDIA_SORT: MediaSortDto = "-createdAt";

/** Server-side filename search, type filter, and sort for the media library. */
export interface MediaListQuery {
  readonly tags?: readonly string[];
  readonly limit?: number;
  readonly q?: string;
  readonly sort?: MediaSortDto;
  readonly type?: MediaMimeTypeDto;
}
