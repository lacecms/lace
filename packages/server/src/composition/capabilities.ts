import {
  AccountUseCases,
  ApiTokenUseCases,
  SiteBuildUseCases,
  readBuildSite,
  unconfiguredEmailSender,
} from "@lacecms/application";
import type {
  Clock,
  ContentUseCases,
  DeferTask,
  MediaUseCases,
  MediaView,
} from "@lacecms/application";
import {
  AuthenticationRequiredError,
  InvariantError,
  adminSessionSchema,
  mediaUrl,
  type BuildSiteIdentityDto,
  toAdminEntryProjectionDto,
  toMediaMetadataDto,
} from "@lacecms/contracts";
import { exportSeo } from "../shared/content-config.js";
import { AuthorizationError, response } from "../shared/http.js";
import type { Actor, LaceAppInput } from "./input.js";
import { composeSettings } from "./settings.js";

const systemClock: Clock = { now: () => Date.now() as ReturnType<Clock["now"]> };
const unavailableBuilds = new SiteBuildUseCases({
  clock: systemClock,
  builds: {
    listSiteBuilds: () => {
      throw new InvariantError("Build reads are unavailable.");
    },
    getSiteBuild: () => {
      throw new InvariantError("Build reads are unavailable.");
    },
    requestBuild: () => {
      throw new InvariantError("Build commands are unavailable.");
    },
  },
});

/**
 * The capabilities route modules call, built once from the application input.
 * Routes receive application operations and transport capabilities.
 */
export function createCapabilities(input: LaceAppInput) {
  const seoSection = exportSeo(input.config);
  const seoModels: ReadonlySet<string> = new Set(Object.keys(seoSection.models));
  const security = input.security;
  const legacyVerifier = security?.verifyBuildToken;
  const apiTokens =
    input.apiTokens ??
    (security === undefined
      ? undefined
      : new ApiTokenUseCases({ clock: systemClock, tokens: security }));
  const settings =
    input.settings ??
    composeSettings({
      configuredModels: input.config.content.length,
      ...(input.email === undefined ? {} : { email: input.email }),
      engineVersion: input.environment.engineVersion,
      mcpEnabled: input.mcpEnabled === true,
      publicBaseUrl: input.publicBaseUrl,
      readiness: input.readiness,
      users: security,
    });
  // Older partial compositions provide security for user administration and
  // session summaries without configuring the invitation and recovery flows.
  const accountAccess =
    input.accounts ??
    (security === undefined
      ? undefined
      : new AccountUseCases({
          clock: systemClock,
          email: input.email ?? unconfiguredEmailSender,
          publicBaseUrl: input.publicBaseUrl ?? "",
          security,
        }));

  function installedAccounts(): AccountUseCases {
    if (accountAccess === undefined) throw new AuthorizationError();
    return accountAccess;
  }

  function tokenAdministration(): ApiTokenUseCases {
    if (apiTokens === undefined) throw new AuthorizationError();
    return apiTokens;
  }

  /** Without security the account routes are unauthorized, as every security route is. */
  function accounts(): AccountUseCases {
    if (input.accounts !== undefined) return input.accounts;
    // Account operations cannot run without the configured security capability.
    if (input.publicBaseUrl !== undefined && security === undefined) throw new AuthorizationError();
    throw new InvariantError("Account flows are unavailable.");
  }

  function media(): MediaUseCases {
    if (input.media === undefined || input.publicBaseUrl === undefined) {
      throw new InvariantError("Media capability is unavailable.");
    }
    return input.media;
  }

  /** Public media URLs come only from configuration, never from the request. */
  function publicMediaUrl(): (mediaId: string) => string {
    const baseUrl = input.publicBaseUrl;
    if (baseUrl === undefined)
      throw new InvariantError("Public content capability is unavailable.");
    return (mediaId) => mediaUrl(baseUrl, mediaId);
  }

  function mediaDto(value: MediaView) {
    return toMediaMetadataDto(value, mediaUrl(input.publicBaseUrl!, value.id));
  }

  async function adminEntryDto(
    resolvedActor: Actor,
    entry: Awaited<ReturnType<ContentUseCases["create"]>>,
  ) {
    return toAdminEntryProjectionDto(
      await input.content.projectAdminEntry({ actor: resolvedActor, entry }),
    );
  }

  async function sessionSummary(resolvedActor: Actor): Promise<Response> {
    const summary = await installedAccounts().sessionSummary(resolvedActor);
    if (summary === null) throw new AuthenticationRequiredError("session");
    return response(adminSessionSchema, summary, 200, { "cache-control": "no-store" });
  }

  function deferTask(context: {
    readonly executionCtx: { waitUntil(task: Promise<unknown>): void };
  }): DeferTask {
    return (task) => {
      const settled = task.then(
        () => undefined,
        () => undefined,
      );
      try {
        context.executionCtx.waitUntil(settled);
        return;
      } catch {
        // Not a Worker request: use the runtime fallback.
      }
      if (input.defer === undefined) void settled;
      else input.defer(settled);
    };
  }

  return Object.freeze({
    accountCapabilities: (actor: Actor) =>
      AccountUseCases.accountCapabilities(
        actor,
        input.mcpEnabled === true && input.oauthConnections !== undefined,
      ),
    accounts,
    adminEntryDto,
    adminPreview: input.adminPreview,
    apiDocsEnabled: input.apiDocsEnabled ?? false,
    auth: input.auth,
    buildTokenVerifier:
      input.buildTokenVerifier ??
      (typeof legacyVerifier === "function" ? legacyVerifier.bind(security) : undefined),
    builds: input.builds ?? unavailableBuilds,
    buildSite: (actor: Actor): BuildSiteIdentityDto | null =>
      readBuildSite(actor, input.buildSite ?? null),
    config: input.config,
    content: input.content,
    deferTask,
    environment: input.environment,
    links: input.links,
    installedAccounts,
    mcp: input.mcp,
    mcpEnabled: input.mcpEnabled ?? false,
    media,
    mediaDto,
    oauthConnections: input.oauthConnections,
    publicBaseUrl: input.publicBaseUrl,
    publicContent: input.publicContent,
    publicMediaUrl,
    readiness: input.readiness,
    seoModels,
    seoSection,
    sessionSummary,
    settings,
    tokenAdministration,
  });
}

export type Capabilities = ReturnType<typeof createCapabilities>;
