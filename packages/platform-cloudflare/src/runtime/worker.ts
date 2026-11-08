import { createD1OAuthPersistence } from "../security/oauth.js";
import { engineVersion } from "./release-version.js";
import { CLOUDFLARE_LIST_QUERY_LIMITS } from "@lacecms/content";
import {
  MediaDeletionDispatcher,
  SITE_BUILD_DEBOUNCE_MS,
  SiteBuildDispatcher,
  SiteBuildTracker,
} from "@lacecms/application";
import type {
  BuildTriggerResult,
  Cache,
  Clock,
  ImageInspector,
  SiteBuildTrigger,
  EmailSender,
} from "@lacecms/application";
import { createCloudflareEmailSender, type SendEmailBinding } from "./email.js";
import {
  TrustedClientAddresses,
  createBetterAuthBoundary,
  createImportActorResolver,
} from "@lacecms/auth";
// Load the auth graph before the SDK: their shared Zod ESM initialization
// otherwise runs after SDK schemas in a combined esbuild bundle.
import { createMcpContentHandler } from "@lacecms/mcp";
import type { ContentModelDefinition, NormalizedConfig } from "@lacecms/config";
import { betterAuthSchema, checkedInMigrations } from "@lacecms/db";
import { unixMilliseconds } from "@lacecms/domain";
import {
  composeLaceServices,
  contentModelResolver,
  createEmailSender,
  createLaceApp,
  type EmailSettings,
  type ReadinessProbe,
  type ServerLogger,
} from "@lacecms/server";
import { drizzle } from "drizzle-orm/d1";
import { ulid } from "ulid";
import { createCloudflareAdminAssets } from "./admin-assets.js";
import { CloudflareKvCache, NoopCloudflareCache } from "./cache.js";
import { D1ContentRepository } from "../repository/repository.js";
import { DeployHookSiteBuildTrigger } from "../deploy/deploy-hook.js";
import { PagesDeploymentStatusReader } from "../deploy/pages-deployments.js";
import { D1FixedWindowRateLimiter, D1SecurityService } from "../security/service.js";
import type { D1Database } from "../d1/database.js";
import { WorkerImageInspector } from "../media/image-inspector.js";
import { CloudflareR2ObjectStorage } from "../media/r2-storage.js";
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
  ["POST", /^\/api\/v1\/admin\/entries\/[^/]+\/unpublish$/u],
  ["DELETE", /^\/api\/v1\/admin\/entries\/[^/]+$/u],
  ["PATCH", /^\/api\/v1\/admin\/media\/[^/]+$/u],
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
  readonly maintainOAuth: () => Promise<void>;
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
    contentModelResolver(input.config),
    { nextId: () => ids.next() },
  );
  const clients = new TrustedClientAddresses();
  const security = new D1SecurityService(settings.database, () => clock.now());
  const sensitiveLimiter = new D1FixedWindowRateLimiter(settings.database, settings.authSecret);
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
  const mcpEnabled = settings.mcpEnabled ?? false;
  const oauth = createD1OAuthPersistence(settings.database);
  const auth = createBetterAuthBoundary({
    clientAddress: (request) => clients.get(request),
    database: drizzle(settings.database as never),
    origin: settings.publicBaseUrl,
    production: settings.production,
    schema: betterAuthSchema,
    secret: settings.authSecret,
    ...(mcpEnabled ? { oauth: { persistence: oauth } } : {}),
  });
  const services = composeLaceServices({
    auth: {
      boundary: auth,
      importActors: createImportActorResolver({
        origin: settings.publicBaseUrl,
        production: settings.production,
        security,
      }),
    },
    clock,
    config: input.config,
    email:
      input.email?.(settings) ?? createWorkerEmailSender(settings.email, settings.emailBinding),
    http: {
      ...(settings.assets === undefined
        ? {}
        : { adminAssets: createCloudflareAdminAssets(settings.assets) }),
      buildSite: settings.buildSite ?? null,
      environment: { engineVersion, openApiTitle: "Lace API" },
      flags: { apiDocsEnabled: settings.apiDocsEnabled ?? false, mcpEnabled },
      maxBodyBytes: 1_048_576,
      publicBaseUrl: settings.publicBaseUrl,
      readiness: new D1Readiness(settings.database),
      requestIds: { next: () => ulid() },
      ...(input.logger === undefined ? {} : { requestLogger: input.logger }),
    },
    ids,
    imageInspector: input.imageInspector ?? new WorkerImageInspector(),
    limits: { clientAddress: (request) => clients.get(request), sensitive: sensitiveLimiter },
    listQueryLimits: CLOUDFLARE_LIST_QUERY_LIMITS,
    logger,
    mcp: {
      connections: oauth,
      createHandler: (content) => createMcpContentHandler({ content, version: engineVersion }),
    },
    repository,
    security,
    storage,
  });
  const app = createLaceApp(services.appInput);
  return Object.freeze({
    clients,
    maintainOAuth: () => {
      const now = Number(clock.now());
      // Rotate bounded maintenance phases; authorization expiry is checked eagerly.
      const minute = Math.floor(now / 60_000) % 3;
      const phase = minute === 0 ? 0 : minute === 1 ? 1 : 2;
      return oauth.cleanup(now, 20, phase);
    },
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
    name: "media-deletion" | "site-build" | "site-build-tracking" | "oauth-cleanup",
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
      await dispatch("oauth-cleanup", () => runtime.maintainOAuth());
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
