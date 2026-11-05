import {
  AccountUseCases,
  requireUsersManager,
  requireSettingsManager,
  unconfiguredEmailSender,
  actorPermissions,
} from "@lacecms/application";
import type {
  ContentUseCases,
  DeferTask,
  MediaUseCases,
  MediaView,
  SecurityService,
} from "@lacecms/application";
import {
  adminSessionSchema,
  mediaUrl,
  toAdminEntryProjectionDto,
  toMediaMetadataDto,
  InvariantError,
} from "@lacecms/contracts";
import { AuthorizationError, response } from "../shared/http.js";
import { exportSeo } from "../shared/content-config.js";
import type { Actor, LaceAppInput } from "./input.js";

export interface ActorContext {
  readonly req: { readonly raw: Request };
  get(key: string): unknown;
  set(key: string, value: unknown): void;
}

export function createRouteContext(input: LaceAppInput) {
  const seoSection = exportSeo(input.config);
  const seoModels: ReadonlySet<string> = new Set(Object.keys(seoSection.models));

  async function actor(context: ActorContext): Promise<Actor> {
    const cached = context.get("lace.actor") as Actor | undefined;
    if (cached !== undefined) return cached;
    const resolved = await input.actors.resolve(context.req.raw);
    if (resolved === null) throw new AuthorizationError();
    context.set("lace.actor", resolved);
    return resolved;
  }

  async function adminEntryDto(
    resolvedActor: Actor,
    entry: Awaited<ReturnType<ContentUseCases["create"]>>,
  ) {
    return toAdminEntryProjectionDto(
      await input.content.projectAdminEntry({ actor: resolvedActor, entry }),
    );
  }

  function security(): SecurityService {
    if (input.security === undefined) throw new AuthorizationError();
    return input.security;
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

  function usersActor(context: Parameters<typeof actor>[0]): Promise<Actor> {
    return actor(context).then((value) => {
      requireUsersManager(value);
      return value;
    });
  }

  function settingsActor(context: Parameters<typeof actor>[0]): Promise<Actor> {
    return actor(context).then((value) => {
      requireSettingsManager(value);
      return value;
    });
  }

  const email = input.email ?? unconfiguredEmailSender;

  async function sessionSummary(resolvedActor: Actor): Promise<Response> {
    const profile = await security().readUserProfile(resolvedActor.id);
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

  let accountUseCases: AccountUseCases | undefined;
  function accounts(): AccountUseCases {
    if (input.publicBaseUrl === undefined)
      throw new InvariantError("Account flows are unavailable.");
    accountUseCases ??= new AccountUseCases({
      clock: { now: () => Date.now() as never },
      email,
      ...(input.sensitiveLimiter === undefined ? {} : { limiter: input.sensitiveLimiter }),
      publicBaseUrl: input.publicBaseUrl,
      security: security(),
    });
    return accountUseCases;
  }

  /** The current session id is resolved once per request beside the actor. */
  async function currentSessionId(context: Parameters<typeof actor>[0]): Promise<string | null> {
    await actor(context);
    const cached = context.get("lace.sessionId") as string | null | undefined;
    if (cached !== undefined) return cached;
    const resolved = (await input.actors.sessionId?.(context.req.raw)) ?? null;
    context.set("lace.sessionId", resolved);
    return resolved;
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

  return {
    input,
    actor,
    adminEntryDto,
    security,
    media,
    publicMediaUrl,
    mediaDto,
    usersActor,
    settingsActor,
    email,
    accounts,
    currentSessionId,
    deferTask,
    seoSection,
    seoModels,
    sessionSummary,
  };
}

export interface RouteContext extends ReturnType<typeof createRouteContext> {}
