import type {
  ContentUseCases,
  ContentLinkUseCases,
  OAuthConnectionUseCases,
  ImportTokenMetadata,
  RateLimitDecision,
  SecurityService,
  SiteBuildUseCases,
  MediaUseCases,
  PublicContentReadPort,
  EmailSender,
  SensitiveRateLimiter,
} from "@lacecms/application";
import type { BuildSiteIdentityDto } from "@lacecms/contracts";
import type { ServerConfig } from "../shared/content-config.js";

export type Actor = Parameters<ContentUseCases["create"]>[0]["actor"];

export interface ActorResolver {
  resolve(request: Request): Promise<Actor | null>;
  /** The opaque id of the provider session authenticating the request, when there is one. */
  sessionId?(request: Request): Promise<string | null>;
}

export interface AuthRouteHandler {
  fetch(request: Request): Promise<Response>;
}

export interface RequestIdGenerator {
  next(): string;
}

export interface RequestRateLimiter {
  check(input: {
    readonly request: Request;
    readonly requestId: string;
    readonly actor?: Actor;
  }): Promise<boolean | RateLimitDecision>;
}

export interface ServerLogger {
  log(entry: {
    readonly actorId?: string;
    readonly durationMs: number;
    readonly method: string;
    readonly path: string;
    readonly requestId: string;
    readonly status: number;
    readonly tool?: string;
    readonly outcome?: "success" | "error";
  }): void;
}

export interface ReadinessProbe {
  isReady(): Promise<boolean>;
}

export interface ServerEnvironmentMetadata {
  readonly engineVersion: string;
  readonly openApiTitle: string;
}

export interface BuiltAdminResponder {
  fetch(request: Request): Promise<Response>;
}

export interface LaceAppInput {
  /** Opt-in browser reference; machine-readable OpenAPI remains available. */
  readonly apiDocsEnabled?: boolean;
  readonly buildSite?: BuildSiteIdentityDto | null;
  readonly auth?: AuthRouteHandler;
  readonly oauthConnections?: OAuthConnectionUseCases;
  readonly mcpEnabled?: boolean;
  readonly mcp?: {
    resolve(
      request: Request,
      scope?: "content:read" | "content:write" | "content:publish",
    ): Promise<
      | { readonly actor: Actor; readonly response?: never }
      | { readonly response: Response; readonly actor?: never }
    >;
    fetch(
      request: Request,
      actor: Actor,
      completed: (event: { readonly tool: string; readonly outcome: "success" | "error" }) => void,
    ): Promise<Response>;
  };
  readonly actors: ActorResolver;
  /**
   * Bearer-only import-token resolution (ADR 0016). Absent means no import
   * credential is accepted; Bearer management requests are then always denied.
   */
  readonly importActors?: {
    resolve(
      request: Request,
    ): Promise<{ readonly actor: Actor; readonly token: ImportTokenMetadata } | null>;
  };
  readonly adminAssets?: BuiltAdminResponder;
  readonly config: ServerConfig;
  readonly content: ContentUseCases;
  readonly links: ContentLinkUseCases;
  readonly environment: ServerEnvironmentMetadata;
  readonly logger: ServerLogger;
  readonly maxBodyBytes: number;
  readonly media?: MediaUseCases;
  readonly publicBaseUrl?: string;
  readonly publicContent: PublicContentReadPort;
  readonly rateLimiter: RequestRateLimiter;
  readonly readiness: ReadinessProbe;
  readonly requestIds: RequestIdGenerator;
  readonly security?: SecurityService;
  readonly builds?: SiteBuildUseCases;
  /** Transactional email; absent means the `none` provider. */
  readonly email?: EmailSender;
  /** Durable fixed-window limiter for limits counted inside use cases (per-email resets). */
  readonly sensitiveLimiter?: SensitiveRateLimiter;
  /**
   * Runs work after the response without delaying it. A Worker request uses its
   * `executionCtx.waitUntil` first; this fallback must never throw or reject.
   */
  readonly defer?: (task: Promise<unknown>) => void;
}
