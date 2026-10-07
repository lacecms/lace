import { engineVersion } from "./release-version.js";
import { ContentUseCases, MediaUseCases, SiteBuildUseCases } from "@lacecms/application";
import type {
  Cache,
  Clock,
  IdGenerator,
  ObjectStorage,
  ImageInspector,
  SiteBuildTrigger,
} from "@lacecms/application";
import { type ContentModelDefinition, type NormalizedConfig } from "@lacecms/config";
import { resolveNodeClientAddress, trustedProxyPolicy } from "./client-address.js";
import { TrustedClientAddresses, createBetterAuthBoundary } from "@lacecms/auth";
import { appliedMigrationQuery, betterAuthSchema, checkedInMigrations } from "@lacecms/db";
import { contentModelKey, unixMilliseconds } from "@lacecms/domain";
import {
  createLaceApp,
  parseBuildSiteIdentity,
  type ActorResolver,
  type BuiltAdminResponder,
  type LaceAppInput,
  type ReadinessProbe,
  type RequestIdGenerator,
  type RequestRateLimiter,
  type ServerLogger,
} from "@lacecms/server";
import { ulid } from "ulid";
import { NodeContentRepository } from "./content-repository.js";
import { NodeFixedWindowRateLimiter, NodeSecurityService } from "./security.js";
import { openNodeDatabase, type NodeDatabase } from "./index.js";
import { NodeSharpImageInspector } from "./image-inspector.js";
import { NodeMinioObjectStorage, type NodeMinioSettings } from "./minio-storage.js";
import { NodeMediaDeletionDispatcher } from "./media-deletion-dispatcher.js";
import { NodeSiteBuildDispatcher } from "./site-build-dispatcher.js";
import { NodeBuilderSiteBuildTrigger, type NodeBuilderTriggerSettings } from "./builder-trigger.js";

export type NodeEnvironment = Readonly<Record<string, string | undefined>>;

export interface NodeEnvironmentIssue {
  readonly reason: string;
  readonly variable: string;
}

/** Startup failures name variables but intentionally never repeat their values. */
export class NodeEnvironmentError extends Error {
  public constructor(readonly issues: readonly NodeEnvironmentIssue[]) {
    super(`Invalid Node environment: ${issues.map((issue) => issue.variable).join(", ")}.`);
    this.name = "NodeEnvironmentError";
  }
}

export interface NodeRuntimeSettings {
  readonly buildSite?: LaceAppInput["buildSite"];
  readonly trustedProxyCidrs?: readonly string[];
  readonly authSecret: string;
  readonly adminDevOrigin?: URL;
  readonly databasePath: string;
  readonly host: string;
  readonly minio: NodeMinioSettings;
  readonly port: number;
  readonly publicBaseUrl: URL;
  readonly siteDevOrigin?: URL;
  readonly builder?: Pick<NodeBuilderTriggerSettings, "baseUrl" | "secret">;
}

function requiredString(
  environment: NodeEnvironment,
  variable: string,
  issues: NodeEnvironmentIssue[],
): string | undefined {
  const value = environment[variable];
  if (value === undefined || value.trim().length === 0) {
    issues.push({ reason: "missing", variable });
    return undefined;
  }
  return value;
}

function absoluteHttpUrl(
  value: string | undefined,
  variable: string,
  issues: NodeEnvironmentIssue[],
  options: { readonly originOnly: boolean },
): URL | undefined {
  if (value === undefined) return undefined;
  try {
    const parsed = new URL(value);
    const canonicalPath = parsed.pathname === "/" || parsed.pathname.endsWith("/");
    if (
      (parsed.protocol !== "http:" && parsed.protocol !== "https:") ||
      parsed.username.length > 0 ||
      parsed.password.length > 0 ||
      parsed.search.length > 0 ||
      parsed.hash.length > 0 ||
      !canonicalPath ||
      parsed.pathname.includes("//") ||
      (options.originOnly && parsed.pathname !== "/")
    ) {
      issues.push({ reason: "invalid", variable });
      return undefined;
    }
    return parsed;
  } catch {
    issues.push({ reason: "invalid", variable });
    return undefined;
  }
}

function validBucket(value: string): boolean {
  return /^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/u.test(value) && !value.includes("..");
}

function positiveInteger(
  value: string | undefined,
  variable: string,
  issues: NodeEnvironmentIssue[],
): number | undefined {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > 60_000) {
    issues.push({ reason: "invalid", variable });
    return undefined;
  }
  return parsed;
}

/** Parses all runtime settings once, without exposing supplied environment values in errors. */
export function parseNodeRuntimeSettings(environment: NodeEnvironment): NodeRuntimeSettings {
  const issues: NodeEnvironmentIssue[] = [];
  const configuredProxies = environment.LACE_TRUSTED_PROXY_CIDRS?.trim();
  const trustedProxyCidrs = configuredProxies
    ? configuredProxies.split(",").map((item) => item.trim())
    : [];
  try {
    trustedProxyPolicy(trustedProxyCidrs);
  } catch {
    issues.push({ reason: "invalid", variable: "LACE_TRUSTED_PROXY_CIDRS" });
  }
  const buildSite = parseBuildSiteIdentity(environment);
  const databasePath = requiredString(environment, "LACE_DATABASE_PATH", issues);
  const authSecret = requiredString(environment, "LACE_AUTH_SECRET", issues);
  const publicBaseUrl = absoluteHttpUrl(
    requiredString(environment, "LACE_PUBLIC_BASE_URL", issues),
    "LACE_PUBLIC_BASE_URL",
    issues,
    { originOnly: false },
  );
  const host = environment.LACE_HOST ?? "127.0.0.1";
  if (host.trim().length === 0 || /\s/u.test(host))
    issues.push({ reason: "invalid", variable: "LACE_HOST" });
  const rawPort = environment.LACE_PORT ?? "3000";
  const port = Number(rawPort);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
    issues.push({ reason: "invalid", variable: "LACE_PORT" });
  }
  const adminDevOrigin = absoluteHttpUrl(
    environment.LACE_ADMIN_DEV_ORIGIN,
    "LACE_ADMIN_DEV_ORIGIN",
    issues,
    { originOnly: true },
  );
  const siteDevOrigin = absoluteHttpUrl(
    environment.LACE_SITE_DEV_ORIGIN,
    "LACE_SITE_DEV_ORIGIN",
    issues,
    { originOnly: true },
  );
  const builderUrl = absoluteHttpUrl(environment.LACE_BUILDER_URL, "LACE_BUILDER_URL", issues, {
    originOnly: true,
  });
  const builderSecret = environment.LACE_BUILDER_SECRET;
  if (builderUrl !== undefined && (builderSecret === undefined || builderSecret.length < 32))
    issues.push({ reason: "invalid", variable: "LACE_BUILDER_SECRET" });
  if (builderUrl === undefined && builderSecret !== undefined)
    issues.push({ reason: "invalid", variable: "LACE_BUILDER_URL" });
  const minioAccessKeyId = requiredString(environment, "LACE_MINIO_ACCESS_KEY", issues);
  const minioBucket = requiredString(environment, "LACE_MINIO_BUCKET", issues);
  if (minioBucket !== undefined && !validBucket(minioBucket)) {
    issues.push({ reason: "invalid", variable: "LACE_MINIO_BUCKET" });
  }
  const minioEndpoint = absoluteHttpUrl(
    requiredString(environment, "LACE_MINIO_ENDPOINT", issues),
    "LACE_MINIO_ENDPOINT",
    issues,
    { originOnly: true },
  );
  const minioRegion = requiredString(environment, "LACE_MINIO_REGION", issues);
  if (minioRegion !== undefined && /\s/u.test(minioRegion)) {
    issues.push({ reason: "invalid", variable: "LACE_MINIO_REGION" });
  }
  const minioSecretAccessKey = requiredString(environment, "LACE_MINIO_SECRET_KEY", issues);
  const minioTimeoutMs = positiveInteger(
    requiredString(environment, "LACE_MINIO_TIMEOUT_MS", issues),
    "LACE_MINIO_TIMEOUT_MS",
    issues,
  );
  if (
    issues.length > 0 ||
    authSecret === undefined ||
    databasePath === undefined ||
    publicBaseUrl === undefined ||
    minioAccessKeyId === undefined ||
    minioBucket === undefined ||
    minioEndpoint === undefined ||
    minioRegion === undefined ||
    minioSecretAccessKey === undefined ||
    minioTimeoutMs === undefined
  ) {
    throw new NodeEnvironmentError(Object.freeze(issues));
  }
  return Object.freeze({
    buildSite,
    trustedProxyCidrs,
    ...(adminDevOrigin === undefined ? {} : { adminDevOrigin }),
    authSecret,
    databasePath,
    host,
    minio: {
      accessKeyId: minioAccessKeyId,
      bucket: minioBucket,
      endpoint: minioEndpoint,
      publicBaseUrl,
      region: minioRegion,
      secretAccessKey: minioSecretAccessKey,
      timeoutMs: minioTimeoutMs,
    },
    port,
    publicBaseUrl,
    ...(siteDevOrigin === undefined ? {} : { siteDevOrigin }),
    ...(builderUrl === undefined || builderSecret === undefined
      ? {}
      : { builder: { baseUrl: builderUrl, secret: builderSecret } }),
  });
}

export class NoopNodeCache implements Cache {
  public async delete(_key: string): Promise<void> {}

  public async get<Value>(_key: string): Promise<Value | null> {
    return null;
  }

  public async set<Value>(_key: string, _value: Value): Promise<void> {}
}

export class NodeInfrastructureUnavailableError extends Error {
  public constructor() {
    super("Infrastructure capability is unavailable.");
    this.name = "NodeInfrastructureUnavailableError";
  }
}

/** Fails closed until the later object-storage adapter replaces this placeholder. */
export class NodePlaceholderObjectStorage implements ObjectStorage {
  public constructor(private readonly publicBaseUrl: URL) {}

  public async createReadUrl(key: string): Promise<string> {
    return new URL(`api/v1/public/media/${encodeURIComponent(key)}`, this.publicBaseUrl).href;
  }

  public async delete(_key: string): Promise<void> {
    throw new NodeInfrastructureUnavailableError();
  }

  public async get(): Promise<never> {
    throw new NodeInfrastructureUnavailableError();
  }

  public async put(): Promise<never> {
    throw new NodeInfrastructureUnavailableError();
  }
}

export class NoopNodeBuildTrigger implements SiteBuildTrigger {
  public async trigger(): Promise<{
    readonly status: "failed";
    readonly reason: "trigger_unavailable";
  }> {
    return { status: "failed", reason: "trigger_unavailable" };
  }
}

export class SystemNodeClock implements Clock {
  public now() {
    return unixMilliseconds(Date.now());
  }
}

export class UlidGenerator implements IdGenerator {
  public next(): string {
    return ulid();
  }
}

export class NodeSqliteReadiness implements ReadinessProbe {
  public constructor(private readonly connection: NodeDatabase["connection"]) {}

  public async isReady(): Promise<boolean> {
    try {
      const installed = this.connection.prepare(appliedMigrationQuery).all() as {
        created_at: number;
      }[];
      const versions = new Set(installed.map((row) => row.created_at));
      return checkedInMigrations.every((migration) => versions.has(migration.createdAt));
    } catch {
      return false;
    }
  }
}

export const anonymousActorResolver: ActorResolver = Object.freeze({
  resolve: async (): Promise<null> => null,
});

export const defaultNodeRequestIds: RequestIdGenerator = Object.freeze({ next: () => ulid() });
export const defaultNodeRateLimiter: RequestRateLimiter = Object.freeze({
  check: async () => true,
});

class NodeRequestRateLimiter implements RequestRateLimiter {
  public constructor(
    private readonly limiter: NodeFixedWindowRateLimiter,
    private readonly clock: Clock,
    private readonly clients: TrustedClientAddresses,
  ) {}
  public async check(input: {
    readonly request: Request;
    readonly actor?: { readonly id: string };
  }): Promise<boolean | import("@lacecms/application").RateLimitDecision> {
    const pathname = new URL(input.request.url).pathname;
    const method = input.request.method;
    const operation =
      pathname.startsWith("/api/auth/") && method !== "GET"
        ? "auth"
        : pathname === "/api/v1/setup/admin"
          ? "setup"
          : pathname.startsWith("/api/v1/admin/api-tokens") && method !== "GET"
            ? "token"
            : pathname === "/api/v1/admin/media" && method === "POST"
              ? "upload"
              : undefined;
    if (operation === undefined) return true;
    if ((operation === "upload" || operation === "token") && input.actor === undefined) return true;
    const subject =
      operation === "upload" || operation === "token"
        ? `actor:${input.actor!.id}`
        : this.clients.get(input.request);
    return this.limiter.check({ now: this.clock.now(), operation, subject });
  }
}
export const defaultNodeLogger: ServerLogger = Object.freeze({
  log: (entry: Parameters<ServerLogger["log"]>[0]) => console.info(JSON.stringify(entry)),
});

export interface CreateNodeRuntimeInput {
  readonly adminAssets?: BuiltAdminResponder;
  readonly actors?: ActorResolver;
  readonly auth?: { readonly actors: ActorResolver; fetch(request: Request): Promise<Response> };
  readonly config: NormalizedConfig<readonly ContentModelDefinition[]>;
  readonly environment?: LaceAppInput["environment"];
  readonly logger?: ServerLogger;
  readonly maxBodyBytes?: number;
  readonly imageInspector?: ImageInspector;
  readonly rateLimiter?: RequestRateLimiter;
  readonly requestIds?: RequestIdGenerator;
  readonly settings: NodeRuntimeSettings;
  readonly storage?: ObjectStorage;
  readonly buildTrigger?: SiteBuildTrigger;
}

export interface NodeRuntime {
  readonly setRequestPeer: (request: Request, peer: string | undefined) => void;
  readonly app: ReturnType<typeof createLaceApp>;
  readonly cache: Cache;
  readonly close: () => void;
  readonly content: ContentUseCases;
  readonly media: MediaUseCases;
  readonly database: NodeDatabase;
  readonly deletionDispatcher: NodeMediaDeletionDispatcher;
  readonly buildDispatcher: NodeSiteBuildDispatcher;
  readonly readiness: ReadinessProbe;
  readonly repository: NodeContentRepository;
  readonly security: NodeSecurityService;
  readonly storage: ObjectStorage;
  readonly verifyStorage: () => Promise<void>;
}

function hasStartupStorageCheck(
  storage: ObjectStorage,
): storage is ObjectStorage & { readonly assertReady: () => Promise<void> } {
  return "assertReady" in storage && typeof storage.assertReady === "function";
}

/** Creates the SQLite-backed Node composition without importing Node code into portable packages. */
export function createNodeRuntime(input: CreateNodeRuntimeInput): NodeRuntime {
  const clients = new TrustedClientAddresses();
  const trusted = trustedProxyPolicy(input.settings.trustedProxyCidrs);
  const database = openNodeDatabase(input.settings.databasePath);
  try {
    const installed = database.connection.prepare(appliedMigrationQuery).all() as {
      created_at: number;
    }[];
    const versions = new Set(installed.map((row) => row.created_at));
    const pending = checkedInMigrations.filter((migration) => !versions.has(migration.createdAt));
    if (pending.length > 0)
      console.error(
        `Database schema is outdated. Run lace db migrate; pending: ${pending.map((item) => item.name).join(", ")}.`,
      );
  } catch {
    console.error("Database schema is outdated. Run lace db migrate.");
  }
  const ids = new UlidGenerator();
  const repository = new NodeContentRepository(
    database.connection,
    (key) => {
      const model = input.config.runtime.content.find((candidate) => candidate.key === key);
      if (model === undefined) return undefined;
      return model.kind === "page"
        ? { key: contentModelKey(model.key), kind: "page", path: model.path }
        : { key: contentModelKey(model.key), kind: "collection", route: model.route };
    },
    { nextId: () => ids.next() },
  );
  const clock = new SystemNodeClock();
  const security = new NodeSecurityService(database.connection, () => clock.now());
  const rateLimiter =
    input.rateLimiter ??
    new NodeRequestRateLimiter(
      new NodeFixedWindowRateLimiter(database.connection, input.settings.authSecret),
      clock,
      clients,
    );
  const cache = new NoopNodeCache();
  const storage = input.storage ?? new NodeMinioObjectStorage(input.settings.minio);
  const deletionDispatcher = new NodeMediaDeletionDispatcher({
    clock,
    logger: {
      error: (entry) => console.error(JSON.stringify({ component: "media-deletion", ...entry })),
    },
    storage,
    work: repository,
  });
  const buildTrigger =
    input.buildTrigger ??
    (input.settings.builder === undefined
      ? new NoopNodeBuildTrigger()
      : new NodeBuilderSiteBuildTrigger(input.settings.builder));
  const builds = new SiteBuildUseCases({ builds: repository, clock });
  const buildDispatcher = new NodeSiteBuildDispatcher({
    clock,
    logger: {
      error: (entry) => console.error(JSON.stringify({ component: "site-build", ...entry })),
    },
    trigger: buildTrigger,
    work: repository,
  });
  const readiness = new NodeSqliteReadiness(database.connection);
  const content = new ContentUseCases({
    clock,
    config: input.config.runtime,
    content: repository,
    idGenerator: ids,
    media: repository,
  });
  const media = new MediaUseCases({
    clock,
    idGenerator: ids,
    imageInspector: input.imageInspector ?? new NodeSharpImageInspector(),
    logger: {
      error: (entry) => console.error(JSON.stringify({ component: "media", ...entry })),
    },
    media: repository,
    publicMedia: repository,
    storage,
  });
  const auth =
    input.auth ??
    createBetterAuthBoundary({
      clientAddress: (request) => clients.get(request),
      database: database.drizzle,
      origin: input.settings.publicBaseUrl,
      production: process.env.NODE_ENV === "production",
      schema: betterAuthSchema,
      secret: input.settings.authSecret,
    });
  const app = createLaceApp({
    ...(input.adminAssets === undefined ? {} : { adminAssets: input.adminAssets }),
    actors: input.actors ?? auth.actors,
    auth,
    builds,
    buildSite: input.settings.buildSite ?? null,
    config: input.config,
    content,
    environment: input.environment ?? { engineVersion, openApiTitle: "Lace API" },
    logger: input.logger ?? defaultNodeLogger,
    maxBodyBytes: input.maxBodyBytes ?? 1_048_576,
    media,
    publicBaseUrl: input.settings.publicBaseUrl.href,
    publicContent: repository,
    rateLimiter,
    readiness,
    requestIds: input.requestIds ?? defaultNodeRequestIds,
    security,
  });
  return Object.freeze({
    setRequestPeer: (request: Request, peer: string | undefined) =>
      clients.set(request, resolveNodeClientAddress(request, peer, trusted)),
    app,
    cache,
    close: () => database.connection.close(),
    content,
    database,
    deletionDispatcher,
    buildDispatcher,
    media,
    readiness,
    repository,
    security,
    storage,
    verifyStorage: () =>
      hasStartupStorageCheck(storage) ? storage.assertReady() : Promise.resolve(),
  });
}

export function nodePublicMediaUrl(settings: NodeRuntimeSettings, key: string): string {
  return new URL(`api/v1/public/media/${encodeURIComponent(key)}`, settings.publicBaseUrl).href;
}
