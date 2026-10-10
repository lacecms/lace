import { engineVersion } from "./release-version.js";
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
  EmailSender,
} from "@lacecms/application";
import { createCloudflareEmailSender, type SendEmailBinding } from "./email.js";
import { TrustedClientAddresses, createBetterAuthBoundary } from "@lacecms/auth";
import type { ContentModelDefinition, NormalizedConfig } from "@lacecms/config";
import { betterAuthSchema, checkedInMigrations } from "@lacecms/db";
import { contentModelKey, unixMilliseconds } from "@lacecms/domain";
import {
  createEmailSender,
  createLaceApp,
  sensitiveRequestLimit,
  type EmailSettings,
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
  /** Overrides the sender composed from the Worker's email settings. */
  readonly email?: (settings: CloudflareSettings) => EmailSender;
  readonly imageInspector?: ImageInspector;
  readonly logger?: ServerLogger;
  readonly operationalLogger?: WorkerOperationalLogger;
  readonly postCommitBuildDelayMs?: number;
}

export interface CloudflareRuntime {
  readonly clients: TrustedClientAddresses;
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
    private readonly clients: TrustedClientAddresses,
  ) {}

  public async check(input: {
    readonly request: Request;
    readonly actor?: { readonly id: string };
  }): Promise<boolean | RateLimitDecision> {
    const limit = sensitiveRequestLimit(input.request.method, new URL(input.request.url).pathname);
    if (limit === undefined) return true;
    if (limit.scope === "actor" && input.actor === undefined) return true;
    const subject =
      limit.scope === "actor" ? `actor:${input.actor!.id}` : this.clients.get(input.request);
    return this.limiter.check({ now: this.clock.now(), operation: limit.operation, subject });
  }
}

const defaultLogger: ServerLogger = Object.freeze({
  log: (entry: Parameters<ServerLogger["log"]>[0]) => console.info(JSON.stringify(entry)),
});

const defaultOperationalLogger: WorkerOperationalLogger = Object.freeze({
  error: (entry: Record<string, string>) => console.error(JSON.stringify(entry)),
});

/** Composes the configured provider; the binding is the only Worker-specific one. */
export function createWorkerEmailSender(
  settings: EmailSettings = { provider: "none" },
  binding?: SendEmailBinding,
): EmailSender {
  return createEmailSender(settings, {
    runtimeSender: (configured) => {
      if (configured.provider !== "cloudflare" || binding === undefined)
        throw new Error(`Email provider ${configured.provider} is unavailable on the Worker.`);
      return createCloudflareEmailSender({
        binding,
        from: configured.from,
        timeoutMs: configured.timeoutMs,
      });
    },
  });
}

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
  const clients = new TrustedClientAddresses();
  const security = new D1SecurityService(settings.database, () => clock.now());
  const sensitiveLimiter = new D1FixedWindowRateLimiter(settings.database, settings.authSecret);
  const rateLimiter = new CloudflareRequestRateLimiter(sensitiveLimiter, clock, clients);
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
    clientAddress: (request) => clients.get(request),
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
    // Requests use their own `waitUntil`; this fallback serves direct app calls.
    defer: (task) => {
      void task.catch(() => logger.error({ component: "deferred", reason: "task_failed" }));
    },
    email:
      input.email?.(settings) ?? createWorkerEmailSender(settings.email, settings.emailBinding),
    environment: { engineVersion, openApiTitle: "Lace API" },
    logger: input.logger ?? defaultLogger,
    maxBodyBytes: 1_048_576,
    media,
    publicBaseUrl: settings.publicBaseUrl.href,
    publicContent: repository,
    rateLimiter,
    readiness: new D1Readiness(settings.database),
    requestIds: { next: () => ulid() },
    security,
    sensitiveLimiter,
  });
  return Object.freeze({
    clients,
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
      // Only the Worker ingress accepts Cloudflare's edge-supplied header.
      // Direct runtime.app calls have no trusted client identity.
      runtime.clients.set(request, request.headers.get("cf-connecting-ip"));
      // Hono reads only `waitUntil`; the account flows defer email delivery through it.
      const response = await runtime.app.fetch(request, env, {
        passThroughOnException: () => undefined,
        props: undefined,
        waitUntil: (promise: Promise<unknown>) => ctx.waitUntil(promise),
      });
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
