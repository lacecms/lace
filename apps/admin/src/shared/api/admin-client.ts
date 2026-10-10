import {
  accountSessionListSchema,
  adminPasswordResetResultSchema,
  adminSessionSchema,
  invitationAcceptResultSchema,
  invitationInspectResultSchema,
  invitationIssueResultSchema,
  invitationListSchema,
  sessionRevocationResultSchema,
  type AccountSessionListDto,
  type AdminPasswordResetResultDto,
  type AdminSessionDto,
  type InvitationAcceptResultDto,
  type InvitationInspectResultDto,
  type InvitationIssueResultDto,
  type InvitationListDto,
  type SessionRevocationResultDto,
  buildSiteSelectionSchema,
  type BuildSiteSelectionDto,
  setupStateSchema,
  setupAdminRequestSchema,
  type SetupStateDto,
  adminSettingsStatusSchema,
  emailTestResultSchema,
  type EmailTestResultDto,
  buildTokenCreatedSchema,
  buildTokenListSchema,
  buildTokenSchema,
  buildQueueReceiptSchema,
  siteBuildRecordSchema,
  siteBuildListSchema,
  adminContentEntrySchema,
  contentEntryListSchema,
  contentModelListSchema,
  contractValidationIssueSchema,
  errorEnvelopeSchema,
  mediaDetailSchema,
  mediaListSchema,
  mediaMetadataSchema,
  managedUserListSchema,
  managedUserSchema,
  publishContentEntryResultSchema,
  type ContentBlockDto,
  type AdminSettingsStatusDto,
  type BuildTokenCreatedDto,
  type BuildTokenDto,
  type BuildTokenListDto,
  type BuildQueueReceiptDto,
  type SiteBuildRecordDto,
  type SiteBuildListDto,
  type ContractValidationIssue,
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
} from "@lacecms/contracts";
import * as v from "valibot";

export const adminQueryKeys = Object.freeze({
  buildSite: ["admin", "build-site"] as const,
  builds: ["admin", "builds"] as const,
  buildDetail: (buildId: string) => ["admin", "builds", buildId] as const,
  settingsStatus: ["admin", "settings", "status"] as const,
  tokens: ["admin", "tokens"] as const,
  users: ["admin", "users"] as const,
  invitations: ["admin", "invitations"] as const,
  /** The signed-in user's own sessions on the account screen. */
  accountSessions: ["admin", "account", "sessions"] as const,
  entry: (entryId: string) => ["admin", "entry", entryId] as const,
  /** One searched, filtered, and sorted collection list; pages are held by the infinite query. */
  entryList: (modelKey: string, query: Pick<EntryListQuery, "q" | "sort" | "status">) =>
    [
      "admin",
      "entries",
      modelKey,
      "list",
      { q: query.q ?? null, sort: query.sort ?? null, status: query.status ?? null },
    ] as const,
  /** First-page summary (singleton and totals) shared by the shell and content overview. */
  entryOverview: (modelKey: string) => ["admin", "entries", modelKey, "overview"] as const,
  /** Invalidation prefix covering every entry query of one model. */
  modelEntries: (modelKey: string) => ["admin", "entries", modelKey] as const,
  /** Invalidation prefix covering every media list and detail query. */
  media: ["admin", "media"] as const,
  /** One searched, filtered, and sorted media list; pages are held by the infinite query. */
  mediaList: (query: Pick<MediaListQuery, "q" | "sort" | "type">) =>
    [
      "admin",
      "media",
      "list",
      { q: query.q ?? null, sort: query.sort ?? null, type: query.type ?? null },
    ] as const,
  /** One media item with the entries that use it. */
  mediaDetail: (mediaId: string) => ["admin", "media", "detail", mediaId] as const,
  models: ["admin", "models"] as const,
  session: ["admin", "session"] as const,
});

export class AdminClientError extends Error {
  readonly code: string | undefined;
  readonly requestId: string | undefined;
  readonly status: number | undefined;
  readonly issues: readonly ContractValidationIssue[] | undefined;

  constructor(input: {
    readonly code?: string;
    readonly message: string;
    readonly requestId?: string;
    readonly status?: number;
    readonly issues?: readonly ContractValidationIssue[];
  }) {
    super(input.message);
    this.name = "AdminClientError";
    this.code = input.code;
    this.requestId = input.requestId;
    this.status = input.status;
    this.issues = input.issues;
  }
}

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
  listSessions(): Promise<AccountSessionListDto>;
  deleteSession(sessionId: string): Promise<void>;
  revokeOtherSessions(): Promise<SessionRevocationResultDto>;
  loadSettingsStatus(): Promise<AdminSettingsStatusDto>;
  /** Sends the fixed test message to the signed-in administrator's own address. */
  sendTestEmail(): Promise<EmailTestResultDto>;
  listTokens(): Promise<BuildTokenListDto>;
  createToken(name: string): Promise<BuildTokenCreatedDto>;
  revokeToken(tokenId: string): Promise<BuildTokenDto>;
  createEntry(modelKey: string, title: string): Promise<AdminContentEntryDto>;
  deleteEntry(entryId: string, expectedRevision: number): Promise<void>;
  loadEntry(entryId: string): Promise<AdminContentEntryDto>;
  listEntries(
    modelKey: string,
    cursor?: string,
    query?: EntryListQuery,
  ): Promise<ContentEntryListDto>;
  listMedia(cursor?: string, query?: MediaListQuery): Promise<MediaListDto>;
  getMedia(mediaId: string): Promise<MediaDetailDto>;
  uploadMedia(file: File, options?: MediaUploadOptions): Promise<MediaMetadataDto>;
  deleteMedia(mediaId: string): Promise<MediaMetadataDto>;
  retryMediaDeletion(mediaId: string): Promise<MediaMetadataDto>;
  listModels(): Promise<ContentModelListDto>;
  publishEntry(
    entryId: string,
    input: { readonly expectedRevision: number; readonly idempotencyKey: string },
  ): Promise<PublishContentEntryResultDto>;
  signIn(email: string, password: string): Promise<void>;
  signOut(): Promise<void>;
  saveDraft(
    entryId: string,
    input: {
      readonly blocks: readonly ContentBlockDto[];
      readonly expectedRevision: number;
      readonly fields: Record<string, unknown>;
      readonly slug?: string;
      readonly title: string;
    },
  ): Promise<AdminContentEntryDto>;
}

/** The entry-list order the API applies when no sort is requested. */
export const DEFAULT_ENTRY_SORT: ContentEntrySortDto = "-updatedAt";

/** Server-side search, status filter, and sort for an admin entry list. */
export interface EntryListQuery {
  readonly limit?: number;
  readonly q?: string;
  readonly sort?: ContentEntrySortDto;
  readonly status?: ContentEntryStatusDto;
}

/** The media-list order the API applies when no sort is requested. */
export const DEFAULT_MEDIA_SORT: MediaSortDto = "-createdAt";

/** Server-side filename search, type filter, and sort for the media library. */
export interface MediaListQuery {
  readonly limit?: number;
  readonly q?: string;
  readonly sort?: MediaSortDto;
  readonly type?: MediaMimeTypeDto;
}

/** Per-upload callbacks; `onProgress` receives the sent fraction (0–1) when the browser reports it. */
export interface MediaUploadOptions {
  readonly onProgress?: (fraction: number) => void;
}

/** A completed upload exchange, independent of the browser API that performed it. */
export interface UploadExchange {
  readonly body: unknown;
  readonly requestId: string | undefined;
  readonly status: number;
}

/**
 * Sends a multipart upload to a same-origin API path. Rejects only when the
 * API cannot be reached; HTTP errors resolve with their status and body.
 */
export type MediaUploader = (
  path: string,
  body: FormData,
  options: MediaUploadOptions,
) => Promise<UploadExchange>;

type Fetcher = typeof fetch;

function responseError(status: number, requestId: string | undefined, body: unknown) {
  const parsed = v.safeParse(errorEnvelopeSchema, body);
  const issues = parsed.success ? parseIssues(parsed.output.error.details?.issues) : undefined;
  return parsed.success
    ? new AdminClientError({
        code: parsed.output.error.code,
        message: parsed.output.error.message,
        ...(requestId === undefined ? {} : { requestId }),
        status,
        ...(issues === undefined ? {} : { issues }),
      })
    : new AdminClientError({
        message: `The Lace API request failed (${status}).`,
        ...(requestId === undefined ? {} : { requestId }),
        status,
      });
}

function unreachable(): AdminClientError {
  return new AdminClientError({ message: "The Lace API could not be reached." });
}

function parseIssues(value: unknown): readonly ContractValidationIssue[] | undefined {
  const parsed = v.safeParse(v.array(contractValidationIssueSchema), value);
  return parsed.success ? parsed.output : undefined;
}

async function json(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

async function request(fetcher: Fetcher, path: string, init: RequestInit = {}): Promise<unknown> {
  let response: Response;
  try {
    response = await fetcher(path, {
      ...init,
      credentials: "same-origin",
      headers: { accept: "application/json", ...init.headers },
    });
  } catch {
    throw unreachable();
  }
  const body = response.status === 204 ? undefined : await json(response);
  if (!response.ok)
    throw responseError(response.status, response.headers.get("x-request-id") ?? undefined, body);
  return body;
}

function postJson(fetcher: Fetcher, path: string, body: unknown): Promise<unknown> {
  return request(fetcher, path, {
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
}

/**
 * Drops validation issues from failures of requests that carry a secret
 * (an account token or a password), so no echoed input can reach the screen.
 */
async function withoutIssues(pending: Promise<unknown>): Promise<unknown> {
  try {
    return await pending;
  } catch (error) {
    if (!(error instanceof AdminClientError) || error.issues === undefined) throw error;
    throw new AdminClientError({
      ...(error.code === undefined ? {} : { code: error.code }),
      message: error.message,
      ...(error.requestId === undefined ? {} : { requestId: error.requestId }),
      ...(error.status === undefined ? {} : { status: error.status }),
    });
  }
}

/** Uploads through `fetch`, which cannot report intermediate upload progress. */
export function fetchUploader(fetcher: Fetcher): MediaUploader {
  return async (path, body) => {
    let response: Response;
    try {
      response = await fetcher(path, {
        body,
        credentials: "same-origin",
        headers: { accept: "application/json" },
        method: "POST",
      });
    } catch {
      throw unreachable();
    }
    return {
      body: await json(response),
      requestId: response.headers.get("x-request-id") ?? undefined,
      status: response.status,
    };
  };
}

/** Uploads through same-origin `XMLHttpRequest` (cookies included) so the browser reports bytes sent. */
export const xhrUploader: MediaUploader = (path, body, options) =>
  new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("POST", path);
    request.setRequestHeader("accept", "application/json");
    request.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable && event.total > 0)
        options.onProgress?.(Math.min(1, event.loaded / event.total));
    });
    request.addEventListener("load", () => {
      let parsed: unknown;
      try {
        parsed = request.responseText === "" ? undefined : JSON.parse(request.responseText);
      } catch {
        parsed = undefined;
      }
      resolve({
        body: parsed,
        requestId: request.getResponseHeader("x-request-id") ?? undefined,
        status: request.status,
      });
    });
    request.addEventListener("error", () => reject(unreachable()));
    request.addEventListener("abort", () => reject(unreachable()));
    request.send(body);
  });

function parse<T>(schema: v.BaseSchema<unknown, T, v.BaseIssue<unknown>>, body: unknown): T {
  const result = v.safeParse(schema, body);
  if (!result.success)
    throw new AdminClientError({ message: "The Lace API returned an invalid response." });
  return result.output;
}

/**
 * Creates the credentialed browser client for the shared admin REST contracts.
 * Uploads report progress through `XMLHttpRequest` unless a fetcher or an
 * uploader is injected; an injected fetcher alone keeps uploads on fetch.
 */
export function createAdminClient(injected?: Fetcher, uploader?: MediaUploader): AdminClient {
  const fetcher: Fetcher = injected ?? fetch;
  const upload =
    uploader ??
    (injected === undefined && typeof XMLHttpRequest !== "undefined"
      ? xhrUploader
      : fetchUploader(fetcher));
  return Object.freeze({
    loadSetupState: async () =>
      parse(setupStateSchema, await request(fetcher, "/api/v1/setup/state", { cache: "no-store" })),
    setupAdmin: async (input: Parameters<AdminClient["setupAdmin"]>[0]) => {
      const validated = v.safeParse(setupAdminRequestSchema, input);
      if (!validated.success)
        throw new AdminClientError({
          message: "Check the email, password and bootstrap token.",
          status: 422,
        });
      try {
        parse(
          managedUserSchema,
          await request(fetcher, "/api/v1/setup/admin", {
            body: JSON.stringify(validated.output),
            headers: { "content-type": "application/json" },
            method: "POST",
          }),
        );
      } catch (error) {
        // Never propagate provider text or validation objects that could echo submitted credentials.
        throw new AdminClientError({
          message: "Administrator setup could not be confirmed.",
          ...(error instanceof AdminClientError && error.status !== undefined
            ? { status: error.status }
            : {}),
        });
      }
    },
    loadBuildSite: async () =>
      parse(buildSiteSelectionSchema, await request(fetcher, "/api/v1/admin/build-site")),
    listBuilds: async () =>
      parse(siteBuildListSchema, await request(fetcher, "/api/v1/admin/site-builds")),
    getBuild: async (buildId: string) =>
      parse(
        siteBuildRecordSchema,
        await request(fetcher, `/api/v1/admin/site-builds/${encodeURIComponent(buildId)}`),
      ),
    requestBuild: async () =>
      parse(
        buildQueueReceiptSchema,
        await request(fetcher, "/api/v1/admin/builds", { method: "POST" }),
      ),
    retryBuild: async (buildId: string) =>
      parse(
        buildQueueReceiptSchema,
        await request(fetcher, `/api/v1/admin/builds/${encodeURIComponent(buildId)}/retry`, {
          method: "POST",
        }),
      ),
    updateUser: async (userId: string, input: Parameters<AdminClient["updateUser"]>[1]) =>
      parse(
        managedUserSchema,
        await request(fetcher, `/api/v1/admin/users/${encodeURIComponent(userId)}`, {
          body: JSON.stringify(input),
          headers: { "content-type": "application/json" },
          method: "PATCH",
        }),
      ),
    listUsers: async () =>
      parse(managedUserListSchema, await request(fetcher, "/api/v1/admin/users")),
    signOutUser: async (userId: string) =>
      parse(
        sessionRevocationResultSchema,
        await postJson(
          fetcher,
          `/api/v1/admin/users/${encodeURIComponent(userId)}/sessions/revoke`,
          {},
        ),
      ),
    sendPasswordReset: async (userId: string) =>
      parse(
        adminPasswordResetResultSchema,
        await postJson(
          fetcher,
          `/api/v1/admin/users/${encodeURIComponent(userId)}/password-reset`,
          {},
        ),
      ),
    listInvitations: async () =>
      parse(invitationListSchema, await request(fetcher, "/api/v1/admin/invitations")),
    createInvitation: async (input: Parameters<AdminClient["createInvitation"]>[0]) =>
      parse(
        invitationIssueResultSchema,
        await postJson(fetcher, "/api/v1/admin/invitations", input),
      ),
    resendInvitation: async (invitationId: string) =>
      parse(
        invitationIssueResultSchema,
        await postJson(
          fetcher,
          `/api/v1/admin/invitations/${encodeURIComponent(invitationId)}/resend`,
          {},
        ),
      ),
    revokeInvitation: async (invitationId: string) => {
      await request(fetcher, `/api/v1/admin/invitations/${encodeURIComponent(invitationId)}`, {
        method: "DELETE",
      });
    },
    inspectInvitation: async (token: string) =>
      parse(
        invitationInspectResultSchema,
        await withoutIssues(postJson(fetcher, "/api/v1/invitations/inspect", { token })),
      ),
    acceptInvitation: async (input: Parameters<AdminClient["acceptInvitation"]>[0]) =>
      parse(
        invitationAcceptResultSchema,
        await withoutIssues(postJson(fetcher, "/api/v1/invitations/accept", input)),
      ),
    requestPasswordReset: async (email: string) => {
      await postJson(fetcher, "/api/v1/password-reset/request", { email });
    },
    confirmPasswordReset: async (input: Parameters<AdminClient["confirmPasswordReset"]>[0]) => {
      await withoutIssues(postJson(fetcher, "/api/v1/password-reset/confirm", input));
    },
    updateProfile: async (input: Parameters<AdminClient["updateProfile"]>[0]) =>
      parse(
        adminSessionSchema,
        await request(fetcher, "/api/v1/account", {
          body: JSON.stringify(input),
          headers: { "content-type": "application/json" },
          method: "PATCH",
        }),
      ),
    changePassword: async (input: Parameters<AdminClient["changePassword"]>[0]) =>
      parse(
        sessionRevocationResultSchema,
        await withoutIssues(postJson(fetcher, "/api/v1/account/password", input)),
      ),
    listSessions: async () =>
      parse(accountSessionListSchema, await request(fetcher, "/api/v1/account/sessions")),
    deleteSession: async (sessionId: string) => {
      await request(fetcher, `/api/v1/account/sessions/${encodeURIComponent(sessionId)}`, {
        method: "DELETE",
      });
    },
    revokeOtherSessions: async () =>
      parse(
        sessionRevocationResultSchema,
        await postJson(fetcher, "/api/v1/account/sessions/revoke-others", {}),
      ),
    loadSettingsStatus: async () =>
      parse(adminSettingsStatusSchema, await request(fetcher, "/api/v1/admin/settings/status")),
    sendTestEmail: async () =>
      parse(
        emailTestResultSchema,
        await request(fetcher, "/api/v1/admin/settings/email-test", {
          body: "{}",
          headers: { "content-type": "application/json" },
          method: "POST",
        }),
      ),
    listTokens: async () =>
      parse(buildTokenListSchema, await request(fetcher, "/api/v1/admin/api-tokens")),
    createToken: async (name: string) =>
      parse(
        buildTokenCreatedSchema,
        await request(fetcher, "/api/v1/admin/api-tokens", {
          body: JSON.stringify({ name }),
          headers: { "content-type": "application/json" },
          method: "POST",
        }),
      ),
    revokeToken: async (tokenId: string) =>
      parse(
        buildTokenSchema,
        await request(fetcher, `/api/v1/admin/api-tokens/${encodeURIComponent(tokenId)}`, {
          method: "DELETE",
        }),
      ),
    createEntry: async (modelKey: string, title: string) =>
      parse(
        adminContentEntrySchema,
        await request(fetcher, `/api/v1/admin/models/${encodeURIComponent(modelKey)}/entries`, {
          body: JSON.stringify({ blocks: [], fields: {}, title }),
          headers: { "content-type": "application/json" },
          method: "POST",
        }),
      ),
    deleteEntry: async (entryId: string, expectedRevision: number) => {
      await request(fetcher, `/api/v1/admin/entries/${encodeURIComponent(entryId)}`, {
        body: JSON.stringify({ expectedRevision }),
        headers: { "content-type": "application/json" },
        method: "DELETE",
      });
    },
    loadEntry: async (entryId: string) =>
      parse(
        adminContentEntrySchema,
        await request(fetcher, `/api/v1/admin/entries/${encodeURIComponent(entryId)}`),
      ),
    listEntries: async (modelKey: string, cursor?: string, query: EntryListQuery = {}) => {
      const search = new URLSearchParams();
      if (cursor !== undefined) search.set("after", cursor);
      if (query.q !== undefined && query.q.trim().length > 0) search.set("q", query.q.trim());
      if (query.status !== undefined) search.set("status", query.status);
      if (query.sort !== undefined) search.set("sort", query.sort);
      if (query.limit !== undefined) search.set("limit", String(query.limit));
      const suffix = search.size === 0 ? "" : `?${search.toString()}`;
      return parse(
        contentEntryListSchema,
        await request(
          fetcher,
          `/api/v1/admin/models/${encodeURIComponent(modelKey)}/entries${suffix}`,
        ),
      );
    },
    listModels: async () =>
      parse(contentModelListSchema, await request(fetcher, "/api/v1/admin/content-models")),
    listMedia: async (cursor?: string, query: MediaListQuery = {}) => {
      const search = new URLSearchParams();
      if (cursor !== undefined) search.set("after", cursor);
      if (query.q !== undefined && query.q.trim().length > 0) search.set("q", query.q.trim());
      if (query.type !== undefined) search.set("type", query.type);
      if (query.sort !== undefined) search.set("sort", query.sort);
      if (query.limit !== undefined) search.set("limit", String(query.limit));
      const suffix = search.size === 0 ? "" : `?${search.toString()}`;
      return parse(mediaListSchema, await request(fetcher, `/api/v1/admin/media${suffix}`));
    },
    getMedia: async (mediaId: string) =>
      parse(
        mediaDetailSchema,
        await request(fetcher, `/api/v1/admin/media/${encodeURIComponent(mediaId)}`),
      ),
    uploadMedia: async (file: File, options: MediaUploadOptions = {}) => {
      const body = new FormData();
      body.append("file", file);
      const exchange = await upload("/api/v1/admin/media", body, options);
      if (exchange.status < 200 || exchange.status >= 300)
        throw responseError(exchange.status, exchange.requestId, exchange.body);
      return parse(mediaMetadataSchema, exchange.body);
    },
    deleteMedia: async (mediaId: string) =>
      parse(
        mediaMetadataSchema,
        await request(fetcher, `/api/v1/admin/media/${encodeURIComponent(mediaId)}`, {
          method: "DELETE",
        }),
      ),
    retryMediaDeletion: async (mediaId: string) =>
      parse(
        mediaMetadataSchema,
        await request(
          fetcher,
          `/api/v1/admin/media/${encodeURIComponent(mediaId)}/retry-deletion`,
          {
            method: "POST",
          },
        ),
      ),
    signIn: async (email: string, password: string) => {
      await request(fetcher, "/api/auth/sign-in/email", {
        body: JSON.stringify({ email, password }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
    },
    signOut: async () => {
      await request(fetcher, "/api/auth/sign-out", { method: "POST" });
    },
    publishEntry: async (
      entryId: string,
      input: { readonly expectedRevision: number; readonly idempotencyKey: string },
    ) =>
      parse(
        publishContentEntryResultSchema,
        await request(fetcher, `/api/v1/admin/entries/${encodeURIComponent(entryId)}/publish`, {
          body: JSON.stringify({ expectedRevision: input.expectedRevision }),
          headers: {
            "content-type": "application/json",
            "idempotency-key": input.idempotencyKey,
          },
          method: "POST",
        }),
      ),
    saveDraft: async (
      entryId: string,
      input: {
        readonly blocks: readonly ContentBlockDto[];
        readonly expectedRevision: number;
        readonly fields: Record<string, unknown>;
        readonly slug?: string;
        readonly title: string;
      },
    ) =>
      parse(
        adminContentEntrySchema,
        await request(fetcher, `/api/v1/admin/entries/${encodeURIComponent(entryId)}/draft`, {
          body: JSON.stringify(input),
          headers: { "content-type": "application/json" },
          method: "PUT",
        }),
      ),
  });
}

export function isSessionExpiredError(error: unknown): error is AdminClientError {
  return error instanceof AdminClientError && (error.status === 401 || error.status === 403);
}
