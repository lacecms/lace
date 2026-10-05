import {
  ContentUseCases,
  MediaDeletionDispatcher,
  MediaUseCases,
  SITE_BUILD_DEBOUNCE_MS,
  SiteBuildDispatcher,
  SiteBuildTracker,
  SiteBuildUseCases,
} from "@lacecms/application";
import type {
  BuildTriggerResult,
  Cache,
  Clock,
  ImageInspector,
  RateLimitDecision,
  SiteBuildTrigger,
} from "@lacecms/application";
import { createBetterAuthBoundary } from "@lacecms/auth";
import type { ContentModelDefinition, NormalizedConfig } from "@lacecms/config";
import { betterAuthSchema, checkedInMigrations } from "@lacecms/db";
import { contentModelKey, unixMilliseconds } from "@lacecms/domain";
import {
  createLaceApp,
  type ReadinessProbe,
  type RequestRateLimiter,
  type ServerLogger,
} from "@lacecms/server";
import { drizzle } from "drizzle-orm/d1";
import { ulid } from "ulid";
import { createCloudflareAdminAssets } from "./admin-assets.js";
import { CloudflareKvCache, NoopCloudflareCache } from "./cache.js";
import { D1ContentRepository } from "./d1-content-repository.js";
import { DeployHookSiteBuildTrigger } from "./deploy-hook.js";
import { PagesDeploymentStatusReader } from "./pages-deployments.js";
import { D1FixedWindowRateLimiter, D1SecurityService } from "./d1-security.js";
import type { D1Database } from "./d1.js";
import { WorkerImageInspector } from "./image-inspector.js";
import { CloudflareR2ObjectStorage } from "./r2-storage.js";
import {
  CloudflareEnvironmentError,
  parseCloudflareSettings,
  type CloudflareSettings,
  type CloudflareWorkerEnv,
} from "./settings.js";

/** Structural subset of the Worker execution context. */
export interface WorkerExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
}

/** Bounded per-invocation claims keep a scheduled run inside the D1 query budget. */
export const SCHEDULED_SITE_BUILD_CLAIMS = 1;
export const SCHEDULED_MEDIA_DELETION_CLAIMS = 5;
/** Tracked provider deployments checked per scheduled run (one Pages request each). */
export const SCHEDULED_TRACKING_CHECKS = 5;
const POST_COMMIT_BUILD_DELAY_MS = SITE_BUILD_DEBOUNCE_MS + 250;

/** Admin mutations that enqueue outbox work and deserve a best-effort post-commit pass. */
const DISPATCH_PRODUCING_REQUESTS: readonly (readonly [string, RegExp])[] = [
  ["POST", /^\/api\/v1\/admin\/entries\/[^/]+\/publish$/u],
  ["DELETE", /^\/api\/v1\/admin\/entries\/[^/]+$/u],
  ["DELETE", /^\/api\/v1\/admin\/media\/[^/]+$/u],
  ["POST", /^\/api\/v1\/admin\/media\/[^/]+\/retry-deletion$/u],
  ["POST", /^\/api\/v1\/admin\/builds$/u],
  ["POST", /^\/api\/v1\/admin\/builds\/[^/]+\/retry$/u],
];

export function producesDispatchWork(request: Request, status: number): boolean {
  if (status < 200 || status > 299) return false;
  const pathname = new URL(request.url).pathname;
  return DISPATCH_PRODUCING_REQUESTS.some(
    ([method, pattern]) => request.method === method && pattern.test(pathname),
  );
}

export interface WorkerOperationalLogger {
  error(entry: Record<string, string>): void;
}

export interface CreateCloudflareWorkerInput {
  readonly buildTrigger?: (settings: CloudflareSettings) => SiteBuildTrigger;
  readonly clock?: Clock;
  readonly config: NormalizedConfig<readonly ContentModelDefinition[]>;
  readonly imageInspector?: ImageInspector;
  readonly logger?: ServerLogger;
  readonly operationalLogger?: WorkerOperationalLogger;
  readonly postCommitBuildDelayMs?: number;
}

export interface CloudflareRuntime {
  readonly app: ReturnType<typeof createLaceApp>;
  readonly buildDispatcher: SiteBuildDispatcher;
  readonly buildTracker: SiteBuildTracker;
  readonly cache: Cache;
  readonly deletionDispatcher: MediaDeletionDispatcher;
  readonly repository: D1ContentRepository;
  readonly security: D1SecurityService;
  readonly settings: CloudflareSettings;
}

export interface CloudflareWorker {
  fetch(request: Request, env: CloudflareWorkerEnv, ctx: WorkerExecutionContext): Promise<Response>;
  runtime(env: CloudflareWorkerEnv): CloudflareRuntime;
  scheduled(
    controller: unknown,
    env: CloudflareWorkerEnv,
    ctx: WorkerExecutionContext,
  ): Promise<void>;
}

/** Without a deploy hook, dispatch records the Node "trigger unavailable" outcome. */
export class UnavailableSiteBuildTrigger implements SiteBuildTrigger {
  public async trigger(): Promise<BuildTriggerResult> {
    return { status: "failed", reason: "trigger_unavailable" };
  }
}

export class SystemWorkerClock implements Clock {
  public now() {
    return unixMilliseconds(Date.now());
  }
}

class D1Readiness implements ReadinessProbe {
  public constructor(private readonly database: D1Database) {}

  public async isReady(): Promise<boolean> {
    try {
      const installed = await this.database
        .prepare("select name from d1_migrations")
        .all<{ name: string }>();
      const names = new Set(installed.results.map((row) => row.name));
      return checkedInMigrations.every((migration) => names.has(migration.name));
    } catch {
      return false;
    }
  }
}

class CloudflareRequestRateLimiter implements RequestRateLimiter {
  public constructor(
    private readonly limiter: D1FixedWindowRateLimiter,
    private readonly clock: Clock,
  ) {}

  public async check(input: { readonly request: Request }): Promise<boolean | RateLimitDecision> {
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
    const subject = input.request.headers.get("cf-connecting-ip")?.trim() || "unknown-client";
    return this.limiter.check({ now: this.clock.now(), operation, subject });
  }
}

const defaultLogger: ServerLogger = Object.freeze({
  log: (entry: Parameters<ServerLogger["log"]>[0]) => console.info(JSON.stringify(entry)),
});

const defaultOperationalLogger: WorkerOperationalLogger = Object.freeze({
  error: (entry: Record<string, string>) => console.error(JSON.stringify(entry)),
});

function unavailableResponse(): Response {
  return Response.json(
    { error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred." } },
    { status: 503 },
  );
}

function wait(delayMs: number): Promise<void> {
  const timers = globalThis as unknown as {
    setTimeout(callback: () => void, delay: number): unknown;
  };
  return new Promise((resolve) => timers.setTimeout(resolve, delayMs));
}

function defaultBuildTrigger(settings: CloudflareSettings): SiteBuildTrigger {
  return settings.deployHookUrl === undefined
    ? new UnavailableSiteBuildTrigger()
    : new DeployHookSiteBuildTrigger({
        timeoutMs: settings.deployHookTimeoutMs,
        tracked: settings.pagesTracking !== undefined,
        url: settings.deployHookUrl,
      });
}

/** Creates the Worker composition from D1, R2, optional KV, assets, and secrets. */
export function createCloudflareRuntime(
  settings: CloudflareSettings,
  input: CreateCloudflareWorkerInput,
): CloudflareRuntime {
  const logger = input.operationalLogger ?? defaultOperationalLogger;
  const clock = input.clock ?? new SystemWorkerClock();
  const ids = { next: () => ulid() };
  const repository = new D1ContentRepository(
    settings.database,
    (key) => {
      const model = input.config.runtime.content.find((candidate) => candidate.key === key);
      if (model === undefined) return undefined;
      return model.kind === "page"
        ? { key: contentModelKey(model.key), kind: "page", path: model.path }
        : { key: contentModelKey(model.key), kind: "collection", route: model.route };
    },
    { nextId: () => ids.next() },
  );
  const security = new D1SecurityService(settings.database, () => clock.now());
  const rateLimiter = new CloudflareRequestRateLimiter(
    new D1FixedWindowRateLimiter(settings.database, settings.authSecret),
    clock,
  );
  const cache =
    settings.cache === undefined
      ? new NoopCloudflareCache()
      : new CloudflareKvCache(settings.cache);
  const storage = new CloudflareR2ObjectStorage(settings.media, {
    publicBaseUrl: settings.publicBaseUrl,
    timeoutMs: settings.storageTimeoutMs,
  });
  const deletionDispatcher = new MediaDeletionDispatcher({
    clock,
    logger: { error: (entry) => logger.error({ component: "media-deletion", ...entry }) },
    storage,
    work: repository,
  });
  const buildDispatcher = new SiteBuildDispatcher({
    clock,
    logger: { error: (entry) => logger.error({ component: "site-build", ...entry }) },
    trigger: input.buildTrigger?.(settings) ?? defaultBuildTrigger(settings),
    work: repository,
  });
  const tracking = settings.pagesTracking;
  const buildTracker = new SiteBuildTracker({
    clock,
    logger: { error: (entry) => logger.error({ component: "site-build-tracking", ...entry }) },
    ...(tracking === undefined
      ? {}
      : {
          reader: new PagesDeploymentStatusReader({
            accountId: tracking.accountId,
            apiBaseUrl: tracking.apiBaseUrl,
            apiToken: tracking.apiToken,
            projectName: tracking.projectName,
          }),
          timeoutMs: tracking.timeoutMs,
        }),
    work: repository,
  });
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
    imageInspector: input.imageInspector ?? new WorkerImageInspector(),
    logger: {
      error: (entry) => logger.error({ component: "media", ...entry }),
    },
    media: repository,
    publicMedia: repository,
    storage,
  });
  const auth = createBetterAuthBoundary({
    database: drizzle(settings.database as never),
    origin: settings.publicBaseUrl,
    production: settings.production,
    schema: betterAuthSchema,
    secret: settings.authSecret,
  });
  const app = createLaceApp({
    ...(settings.assets === undefined
      ? {}
      : { adminAssets: createCloudflareAdminAssets(settings.assets) }),
    actors: auth.actors,
    auth,
    builds: new SiteBuildUseCases({ builds: repository, clock }),
    config: input.config,
    buildSite: settings.buildSite ?? null,
    content,
    environment: { engineVersion: "0.0.0", openApiTitle: "Lace API" },
    logger: input.logger ?? defaultLogger,
    maxBodyBytes: 1_048_576,
    media,
    publicBaseUrl: settings.publicBaseUrl.href,
    publicContent: repository,
    rateLimiter,
    readiness: new D1Readiness(settings.database),
    requestIds: { next: () => ulid() },
    security,
  });
  return Object.freeze({
    app,
    buildDispatcher,
    buildTracker,
    cache,
    deletionDispatcher,
    repository,
    security,
    settings,
  });
}

/**
 * Builds the Worker module handlers. The runtime is composed once per isolate
 * for each `env` object; scheduled runs are the durable recovery path and
 * post-commit `waitUntil` passes only reduce latency.
 */
export function createCloudflareWorker(input: CreateCloudflareWorkerInput): CloudflareWorker {
  const runtimes = new WeakMap<object, CloudflareRuntime | CloudflareEnvironmentError>();
  const logger = input.operationalLogger ?? defaultOperationalLogger;

  function resolve(env: CloudflareWorkerEnv): CloudflareRuntime | CloudflareEnvironmentError {
    const cached = runtimes.get(env);
    if (cached !== undefined) return cached;
    let value: CloudflareRuntime | CloudflareEnvironmentError;
    try {
      value = createCloudflareRuntime(parseCloudflareSettings(env), input);
    } catch (error) {
      if (!(error instanceof CloudflareEnvironmentError)) throw error;
      value = error;
    }
    runtimes.set(env, value);
    return value;
  }

  function configured(env: CloudflareWorkerEnv): CloudflareRuntime | undefined {
    const value = resolve(env);
    if (value instanceof CloudflareEnvironmentError) {
      logger.error({
        component: "worker",
        reason: "invalid_environment",
        variables: value.issues.map((issue) => issue.variable).join(","),
      });
      return undefined;
    }
    return value;
  }

  /** One dispatcher's failure is logged and never prevents the next from running. */
  async function dispatch(
    name: "media-deletion" | "site-build" | "site-build-tracking",
    run: () => Promise<void>,
  ): Promise<void> {
    try {
      await run();
    } catch {
      logger.error({ component: "dispatch", dispatcher: name, reason: "dispatch_failed" });
    }
  }

  async function postCommit(runtime: CloudflareRuntime): Promise<void> {
    await dispatch("media-deletion", () =>
      runtime.deletionDispatcher.runOnce(SCHEDULED_MEDIA_DELETION_CLAIMS),
    );
    await wait(input.postCommitBuildDelayMs ?? POST_COMMIT_BUILD_DELAY_MS);
    await dispatch("site-build", () =>
      runtime.buildDispatcher.runOnce(SCHEDULED_SITE_BUILD_CLAIMS),
    );
  }

  return Object.freeze({
    async fetch(request: Request, env: CloudflareWorkerEnv, ctx: WorkerExecutionContext) {
      const runtime = configured(env);
      if (runtime === undefined) return unavailableResponse();
      const response = await runtime.app.fetch(request);
      if (producesDispatchWork(request, response.status)) ctx.waitUntil(postCommit(runtime));
      return response;
    },
    runtime(env: CloudflareWorkerEnv): CloudflareRuntime {
      const value = resolve(env);
      if (value instanceof CloudflareEnvironmentError) throw value;
      return value;
    },
    async scheduled(_controller: unknown, env: CloudflareWorkerEnv) {
      const runtime = configured(env);
      if (runtime === undefined) return;
      await dispatch("site-build", () =>
        runtime.buildDispatcher.runOnce(SCHEDULED_SITE_BUILD_CLAIMS),
      );
      await dispatch("site-build-tracking", () =>
        runtime.buildTracker.runOnce(SCHEDULED_TRACKING_CHECKS),
      );
      await dispatch("media-deletion", () =>
        runtime.deletionDispatcher.runOnce(SCHEDULED_MEDIA_DELETION_CLAIMS),
      );
    },
  });
}
