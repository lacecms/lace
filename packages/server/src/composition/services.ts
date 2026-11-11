import {
  AccountUseCases,
  ContentLinkUseCases,
  routeLessModelKeys,
  ContentUseCases,
  MediaUseCases,
  OAuthConnectionUseCases,
  SiteBuildUseCases,
} from "@lacecms/application";
import type {
  Clock,
  EmailSender,
  IdGenerator,
  ImageInspector,
  ObjectStorage,
  OAuthConnectionPort,
  PublicContentReadPort,
  SecurityService,
  SensitiveRateLimiter,
} from "@lacecms/application";
import type { BuildSiteIdentityDto } from "@lacecms/contracts";
import type { RuntimeFeatureFlags } from "../runtime/feature-flags.js";
import { SensitiveRequestRateLimiter } from "../security/request-rate-limiter.js";
import type { ServerConfig } from "../shared/content-config.js";
import type {
  ActorResolver,
  AuthRouteHandler,
  BuiltAdminResponder,
  LaceAppInput,
  ReadinessProbe,
  RequestIdGenerator,
  RequestRateLimiter,
  ServerEnvironmentMetadata,
  ServerLogger,
} from "./input.js";

type ContentInput = ConstructorParameters<typeof ContentUseCases>[0];
type MediaInput = ConstructorParameters<typeof MediaUseCases>[0];
type BuildsInput = ConstructorParameters<typeof SiteBuildUseCases>[0];
type LaceMcp = NonNullable<LaceAppInput["mcp"]>;

/** Every persistence port the portable services read or write. */
export type LaceRepository = ContentInput["content"] &
  ContentInput["media"] &
  MediaInput["media"] &
  MediaInput["publicMedia"] &
  BuildsInput["builds"] &
  ConstructorParameters<typeof ContentLinkUseCases>[0] &
  PublicContentReadPort;

/** Structured operational failures (`component` plus closed reasons); never request data. */
export interface OperationalLogger {
  error(entry: Readonly<Record<string, string>>): void;
}

/** The runtime's authentication boundary (Better Auth on both runtimes). */
export interface LaceAuthBoundary extends AuthRouteHandler {
  readonly actors: ActorResolver;
  /** Present when OAuth is configured for MCP. */
  readonly mcp?: { readonly resolve: LaceMcp["resolve"] };
}

/** Runtime adapters and settings; the composition constructs every use case from them. */
export interface LaceServicesInput {
  readonly config: ServerConfig & { readonly runtime: ContentInput["config"] };
  readonly repository: LaceRepository;
  readonly security: SecurityService;
  readonly storage: ObjectStorage;
  readonly imageInspector: ImageInspector;
  readonly clock: Clock;
  readonly ids: IdGenerator;
  readonly listQueryLimits: NonNullable<ContentInput["listQueryLimits"]>;
  readonly logger: OperationalLogger;
  readonly email: EmailSender;
  readonly limits: {
    /** Durable fixed-window limiter for sensitive routes and per-email resets. */
    readonly sensitive: SensitiveRateLimiter;
    /** The trusted client address of a request. */
    readonly clientAddress: (request: Request) => string;
    /** Test override; when present the sensitive limiter is not handed to the app. */
    readonly requests?: RequestRateLimiter;
  };
  readonly auth: {
    readonly boundary: LaceAuthBoundary;
    /** Test override of the boundary's actor resolution. */
    readonly actors?: ActorResolver;
    readonly importActors: NonNullable<LaceAppInput["importActors"]>;
  };
  /** MCP adapters; used only when `http.flags.mcpEnabled`. */
  readonly mcp?: {
    readonly createHandler: (content: ContentUseCases) => { readonly fetch: LaceMcp["fetch"] };
    readonly connections: OAuthConnectionPort;
  };
  readonly http: {
    readonly flags: RuntimeFeatureFlags;
    readonly publicBaseUrl: URL;
    readonly buildSite: BuildSiteIdentityDto | null;
    readonly readiness: ReadinessProbe;
    readonly environment: ServerEnvironmentMetadata;
    readonly maxBodyBytes: number;
    readonly requestIds: RequestIdGenerator;
    /** Defaults to one JSON line per request on standard output. */
    readonly requestLogger?: ServerLogger;
    readonly adminAssets?: BuiltAdminResponder;
  };
}

export interface LaceServices {
  readonly content: ContentUseCases;
  readonly media: MediaUseCases;
  readonly links: ContentLinkUseCases;
  readonly builds: SiteBuildUseCases;
  readonly accounts: AccountUseCases;
  readonly oauthConnections?: OAuthConnectionUseCases;
  /** The complete `createLaceApp` input. */
  readonly appInput: LaceAppInput;
}

export const jsonRequestLogger: ServerLogger = Object.freeze({
  log: (entry: Parameters<ServerLogger["log"]>[0]) => console.info(JSON.stringify(entry)),
});

/**
 * Composes the portable use cases and HTTP input both runtimes share. Runtime
 * composition roots build adapters, dispatchers and process wiring only.
 */
export function composeLaceServices(input: LaceServicesInput): LaceServices {
  const { clock, logger, repository } = input;
  const content = new ContentUseCases({
    clock,
    config: input.config.runtime,
    content: repository,
    idGenerator: input.ids,
    listQueryLimits: input.listQueryLimits,
    media: repository,
  });
  const media = new MediaUseCases({
    clock,
    drafts: content,
    idGenerator: input.ids,
    imageInspector: input.imageInspector,
    logger: { error: (entry) => logger.error({ component: "media", ...entry }) },
    media: repository,
    publicMedia: repository,
    storage: input.storage,
  });
  const links = new ContentLinkUseCases(repository, routeLessModelKeys(input.config.content));
  const builds = new SiteBuildUseCases({ builds: repository, clock });
  const publicBaseUrl = input.http.publicBaseUrl.href;
  const requests = input.limits.requests;
  // A request-limiter override (tests) also disables the per-email reset limit.
  const accounts = new AccountUseCases({
    clock,
    email: input.email,
    ...(requests === undefined ? { limiter: input.limits.sensitive } : {}),
    publicBaseUrl,
    security: input.security,
  });
  const { flags } = input.http;
  const mcpAdapters = flags.mcpEnabled ? input.mcp : undefined;
  const oauthConnections =
    mcpAdapters === undefined
      ? undefined
      : new OAuthConnectionUseCases({ clock, connections: mcpAdapters.connections });
  const oauthBoundary = input.auth.boundary.mcp;
  const mcp: LaceMcp | undefined =
    mcpAdapters === undefined || oauthBoundary === undefined
      ? undefined
      : { fetch: mcpAdapters.createHandler(content).fetch, resolve: oauthBoundary.resolve };
  const appInput: LaceAppInput = {
    accounts,
    actors: input.auth.actors ?? input.auth.boundary.actors,
    ...(input.http.adminAssets === undefined ? {} : { adminAssets: input.http.adminAssets }),
    apiDocsEnabled: flags.apiDocsEnabled,
    auth: input.auth.boundary,
    builds,
    buildSite: input.http.buildSite,
    config: input.config,
    content,
    // Requests use their own `waitUntil` when they have one; this is the fallback.
    defer: (task) => {
      void task.catch(() => logger.error({ component: "deferred", reason: "task_failed" }));
    },
    email: input.email,
    environment: input.http.environment,
    importActors: input.auth.importActors,
    links,
    logger: input.http.requestLogger ?? jsonRequestLogger,
    maxBodyBytes: input.http.maxBodyBytes,
    ...(mcp === undefined ? {} : { mcp }),
    mcpEnabled: flags.mcpEnabled,
    media,
    ...(oauthConnections === undefined ? {} : { oauthConnections }),
    publicBaseUrl,
    publicContent: repository,
    rateLimiter:
      requests ??
      new SensitiveRequestRateLimiter(input.limits.sensitive, clock, input.limits.clientAddress),
    readiness: input.http.readiness,
    requestIds: input.http.requestIds,
    security: input.security,
    ...(requests === undefined ? { sensitiveLimiter: input.limits.sensitive } : {}),
  };
  return Object.freeze({
    accounts,
    appInput: Object.freeze(appInput),
    builds,
    content,
    links,
    media,
    ...(oauthConnections === undefined ? {} : { oauthConnections }),
  });
}
