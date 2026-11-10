import { canonicalCollectionFilters, collectionFieldFiltersSchema } from "@lacecms/contracts";
import * as v from "valibot";
import {
  AdminClientError,
  fetchUploader,
  xhrUploader,
  type Fetcher,
  type MediaUploader,
} from "./admin-transport.js";
import { COLLECTION_MATCHING_VERSION, NODE_LIST_QUERY_LIMITS } from "@lacecms/contracts";
import { buildsClient } from "./admin-client/builds.js";
import { accountsClient } from "./admin-client/accounts.js";
import { settingsClient } from "./admin-client/settings.js";
import { mediaClient } from "./admin-client/media.js";
import { contentClient } from "./admin-client/content.js";
import {
  type AdminClient,
  type EntryListQuery,
  type MediaListQuery,
} from "./admin-client-types.js";
export {
  DEFAULT_ENTRY_SORT,
  DEFAULT_MEDIA_SORT,
  type AdminClient,
  type EntryListQuery,
  type MediaListQuery,
} from "./admin-client-types.js";
export {
  AdminClientError,
  fetchUploader,
  xhrUploader,
  type MediaUploader,
  type MediaUploadOptions,
  type UploadExchange,
} from "./admin-transport.js";

export const adminQueryKeys = Object.freeze({
  accountCapabilities: ["admin", "account", "capabilities"] as const,
  mcpConnections: ["admin", "account", "mcp-connections"] as const,
  mcpConsent: (transaction: string) => ["admin", "mcp-consent", transaction] as const,
  buildSite: ["admin", "build-site"] as const,
  builds: ["admin", "builds"] as const,
  buildDetail: (buildId: string) => ["admin", "builds", buildId] as const,
  settingsStatus: ["admin", "settings", "status"] as const,
  tokens: ["admin", "tokens"] as const,
  importTokens: ["admin", "import-tokens"] as const,
  users: ["admin", "users"] as const,
  invitations: ["admin", "invitations"] as const,
  /** The signed-in user's own sessions on the account screen. */
  accountSessions: ["admin", "account", "sessions"] as const,
  entry: (entryId: string) => ["admin", "entry", entryId] as const,
  /** One searched, filtered, and sorted collection list; pages are held by the infinite query. */
  entryList: (
    modelKey: string,
    query: Pick<
      EntryListQuery,
      "q" | "sort" | "status" | "filters" | "capabilities" | "listQueryLimits"
    >,
  ) =>
    [
      "admin",
      "entries",
      modelKey,
      "list",
      {
        matchingVersion: COLLECTION_MATCHING_VERSION,
        listQueryLimits: query.listQueryLimits ?? NODE_LIST_QUERY_LIMITS,
        q: query.q ?? null,
        sort: query.sort ?? null,
        status: query.status ?? null,
        ...(query.filters?.length
          ? {
              filters: canonicalCollectionFilters(
                v.parse(collectionFieldFiltersSchema, query.filters),
              ),
            }
          : {}),
        ...(query.capabilities === undefined ? {} : { capabilities: query.capabilities }),
      },
    ] as const,
  /** First-page summary (singleton and totals) shared by the shell and content overview. */
  entryOverview: (modelKey: string) => ["admin", "entries", modelKey, "overview"] as const,
  /** Invalidation prefix covering every entry query of one model. */
  modelEntries: (modelKey: string) => ["admin", "entries", modelKey] as const,
  /** Invalidation prefix covering every media list and detail query. */
  media: ["admin", "media"] as const,
  /** One searched, filtered, and sorted media list; pages are held by the infinite query. */
  mediaList: (query: Pick<MediaListQuery, "q" | "sort" | "tags" | "type">) =>
    [
      ...adminQueryKeys.media,
      "list",
      {
        q: query.q ?? null,
        sort: query.sort ?? null,
        tags: query.tags === undefined || query.tags.length === 0 ? null : [...query.tags].sort(),
        type: query.type ?? null,
      },
    ] as const,
  /** Invalidation prefix covering every tag-suggestion query. */
  mediaTagsPrefix: ["admin", "media", "tags"] as const,
  /** Tag suggestions for one normalized prefix; `null` lists from the start. */
  mediaTags: (prefix: string | undefined) => ["admin", "media", "tags", prefix ?? null] as const,
  /** One media item with the entries that use it. */
  mediaDetail: (mediaId: string) => ["admin", "media", "detail", mediaId] as const,
  models: ["admin", "models"] as const,
  session: ["admin", "session"] as const,
});

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
    ...buildsClient(fetcher),
    ...accountsClient(fetcher),
    ...settingsClient(fetcher),
    ...contentClient(fetcher),
    ...mediaClient(fetcher, upload),
  });
}

export function isSessionExpiredError(error: unknown): error is AdminClientError {
  return error instanceof AdminClientError && (error.status === 401 || error.status === 403);
}
