import type {
  AccountUseCases,
  ApiTokenUseCases,
  ContentUseCases,
  ContentLinkUseCases,
  ContentReferenceUseCases,
  OAuthConnectionUseCases,
  ImportTokenMetadata,
  RateLimitDecision,
  SecurityService,
  SettingsUseCases,
  SiteBuildUseCases,
  TokenSecurityPort,
  MediaUseCases,
  MediaThumbnails,
  PublicContentReadPort,
  EmailSender,
  SensitiveRateLimiter,
  PreviewBrowserAccess,
  PreviewAdmissionService,
  PreviewArtifactReader,
} from "@lacecms/application";
import type { BuildSiteIdentityDto } from "@lacecms/contracts";
import type { ServerConfig } from "../shared/content-config.js";
import type { SensitiveRequestLimit } from "../routing/route-policy.js";

export type Actor = Parameters<ContentUseCases["create"]>[0]["actor"];

export interface ActorResolver {
  resolve(request: Request): Promise<Actor | "request-denied" | null>;
  /** The opaque id of the provider session authenticating the request, when there is one. */
  sessionId?(request: Request): Promise<string | null>;
}

export interface AuthRouteHandler {
  fetch(request: Request, clientAddress?: string): Promise<Response>;
}

export interface RequestIdGenerator {
  next(): string;
}

export interface RequestRateLimiter {
  check(input: {
    readonly request: Request;
    readonly requestId: string;
    readonly clientAddress?: string;
    readonly actor?: Actor;
    /** The matched transport policy. Null means no sensitive limit applies. */
    readonly limit?: SensitiveRequestLimit | null;
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

export type AdminPreview = Pick<PreviewAdmissionService, "status" | "create"> & {
  readonly origin: string;
};

export interface LaceAppInput {
  /** Preview readiness and admission supplied by the runtime. */
  readonly adminPreview?: AdminPreview | "configuration-required";
  /** Present only for complete preview delivery composition or a checkpoint fixture. */
  readonly preview?: PreviewBrowserAccess<Request>;
  readonly reservedPreviewHostname?: string;
  readonly previewArtifacts?: PreviewArtifactReader;
  readonly previewRunner?: {
    readonly origin: URL;
    readonly fetch: (request: Request) => Promise<Response>;
  };
  /** Original request-target supplied by Node ingress before URL normalization. */
  readonly previewRawPath?: (request: Request) => string | undefined;
  /** Reads trusted ingress metadata from the original request. */
  readonly clientAddress?: (request: Request) => string;
  /** Setup, user administration, invitations, recovery and self-service. */
  readonly accounts?: AccountUseCases;
  readonly apiTokens?: ApiTokenUseCases;
  readonly settings?: SettingsUseCases;
  /** Opt-in browser reference; machine-readable OpenAPI remains available. */
  readonly apiDocsEnabled?: boolean;
  readonly buildSite?: BuildSiteIdentityDto | null;
  /** When callable, enables authentication and route registration for build reads. */
  readonly buildTokenVerifier?: TokenSecurityPort["verifyBuildToken"];
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
    ): Promise<
      { readonly actor: Actor; readonly token: ImportTokenMetadata } | "request-denied" | null
    >;
  };
  readonly adminAssets?: BuiltAdminResponder;
  readonly config: ServerConfig;
  readonly content: ContentUseCases;
  readonly links: ContentLinkUseCases;
  readonly references: ContentReferenceUseCases;
  readonly environment: ServerEnvironmentMetadata;
  readonly logger: ServerLogger;
  readonly maxBodyBytes: number;
  readonly media?: MediaUseCases;
  readonly thumbnails?: MediaThumbnails;
  readonly publicBaseUrl?: string;
  readonly publicContent: PublicContentReadPort;
  readonly rateLimiter: RequestRateLimiter;
  readonly readiness: ReadinessProbe;
  readonly requestIds: RequestIdGenerator;
  /** Security adapters for callers that supply their own partial application composition. */
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
