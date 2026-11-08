import { actorPermissions, unconfiguredEmailSender } from "@lacecms/application";
import type {
  AccountSecurityPort,
  AccountUseCases,
  ContentUseCases,
  DeferTask,
  MediaUseCases,
  MediaView,
  TokenSecurityPort,
  UserProfileReader,
} from "@lacecms/application";
import {
  InvariantError,
  adminSessionSchema,
  mediaUrl,
  toAdminEntryProjectionDto,
  toMediaMetadataDto,
} from "@lacecms/contracts";
import { exportSeo } from "../shared/content-config.js";
import { AuthorizationError, response } from "../shared/http.js";
import type { Actor, LaceAppInput } from "./input.js";

/**
 * The capabilities route modules call, built once from the application input.
 * Routes receive these and actor resolution, never the input itself; security
 * is reachable only through the narrow port each route needs.
 */
export function createCapabilities(input: LaceAppInput) {
  const seoSection = exportSeo(input.config);
  const seoModels: ReadonlySet<string> = new Set(Object.keys(seoSection.models));
  const email = input.email ?? unconfiguredEmailSender;
  const security = input.security;

  function requireSecurity<Port>(port: Port | undefined): Port {
    if (port === undefined) throw new AuthorizationError();
    return port;
  }

  const accountSecurity = (): AccountSecurityPort => requireSecurity(security);
  const tokenSecurity = (): TokenSecurityPort => requireSecurity(security);
  const profiles = (): UserProfileReader => requireSecurity(security);

  /** Without security the account routes are unauthorized, as every security route is. */
  function accounts(): AccountUseCases {
    if (input.accounts !== undefined) return input.accounts;
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
    const profile = await profiles().readUserProfile(resolvedActor.id);
    if (profile === null || profile.disabled) throw new AuthorizationError();
    return response(
      adminSessionSchema,
      {
        permissions: [...actorPermissions(resolvedActor)],
        user: {
          ...(profile.name === undefined ? {} : { displayName: profile.name }),
          email: profile.email,
          id: resolvedActor.id,
          role: resolvedActor.role,
        },
      },
      200,
      { "cache-control": "no-store" },
    );
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
    accountSecurity,
    accounts,
    adminEntryDto,
    apiDocsEnabled: input.apiDocsEnabled ?? false,
    auth: input.auth,
    /** Absent security leaves the build export without a credential check (tests). */
    buildTokens: security as Pick<TokenSecurityPort, "verifyBuildToken"> | undefined,
    builds: input.builds,
    buildSite: input.buildSite ?? null,
    config: input.config,
    content: input.content,
    deferTask,
    email,
    environment: input.environment,
    links: input.links,
    mcp: input.mcp,
    mcpEnabled: input.mcpEnabled ?? false,
    media,
    mediaDto,
    oauthConnections: input.oauthConnections,
    profiles,
    publicBaseUrl: input.publicBaseUrl,
    publicContent: input.publicContent,
    publicMediaUrl,
    readiness: input.readiness,
    seoModels,
    seoSection,
    sessionSummary,
    tokenSecurity,
  });
}

export type Capabilities = ReturnType<typeof createCapabilities>;
