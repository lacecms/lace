import {
  AccountError,
  AccountUseCases,
  ContentUseCases,
  ContentValidationError,
  RateLimitExceededError,
  MAX_MEDIA_BYTES,
  MediaUseCases,
  opaqueCursor,
  requireUsersManager,
  requireContentReader,
  requireSettingsManager,
  actorPermissions,
  sendTestEmail,
  unconfiguredEmailSender,
  SiteBuildUseCases,
} from "@lacecms/application";
import type {
  DeferTask,
  EmailSender,
  InvitationIssueResult,
  InvitationView,
  LinkIssueResult,
  MediaView,
  PublicContentReadPort,
  RateLimitDecision,
  SecurityService,
  SensitiveRateLimiter,
} from "@lacecms/application";
import {
  buildExportSchema,
  buildSiteSelectionSchema,
  type BuildSiteIdentityDto,
  buildTokenCreateRequestSchema,
  buildTokenCreatedSchema,
  buildTokenListSchema,
  buildTokenSchema,
  buildRequestSchema,
  buildQueueReceiptSchema,
  siteBuildRecordSchema,
  siteBuildListSchema,
  adminSettingsStatusSchema,
  adminSessionSchema,
  emailTestRequestSchema,
  emailTestResultSchema,
  adminContentEntrySchema,
  classifyError,
  contentEntryListQuerySchema,
  contentEntryListSchema,
  contentModelListSchema,
  managedUserListSchema,
  managedUserSchema,
  mediaDetailSchema,
  mediaListQuerySchema,
  mediaListSchema,
  mediaMetadataSchema,
  mediaUrl,
  createContentEntryRequestSchema,
  deleteContentEntryRequestSchema,
  entityTagForVersion,
  entityTagSchema,
  errorEnvelopeSchema,
  idempotencyKeySchema,
  identifierSchemaPublic,
  opaqueCursorSchema,
  publishContentEntryResultSchema,
  publicContentEntrySchema,
  publicContentListSchema,
  publishContentEntryRequestSchema,
  resolveExpectedRevision,
  saveDraftRequestSchema,
  setupAdminRequestSchema,
  setupStateSchema,
  toAdminContentEntryDto,
  toBuildExportDto,
  toSiteBuildRecordDto,
  toContentEntryDto,
  toContentModelDto,
  toIsoTimestamp,
  toMediaDetailDto,
  toMediaMetadataDto,
  toPublishContentEntryResultDto,
  transportError,
  userUpdateRequestSchema,
  accountPasswordChangeRequestSchema,
  accountProfileUpdateRequestSchema,
  accountSessionListSchema,
  adminPasswordResetRequestSchema,
  adminPasswordResetResultSchema,
  invitationAcceptRequestSchema,
  invitationAcceptResultSchema,
  invitationCreateRequestSchema,
  invitationInspectRequestSchema,
  invitationInspectResultSchema,
  invitationIssueResultSchema,
  invitationListSchema,
  invitationResendRequestSchema,
  passwordResetConfirmRequestSchema,
  passwordResetRequestSchema,
  sessionRevocationResultSchema,
  sessionRevokeRequestSchema,
  validationError,
  versionFromEntityTag,
} from "@lacecms/contracts";
import {
  MaxFileSizeExceededError,
  MultipartParseError,
  parseMultipartRequest,
} from "@mjackson/multipart-parser";
import type { ClassifiedError, ContractValidationIssue } from "@lacecms/contracts";
import { toJsonSchema } from "@valibot/to-json-schema";
import { bodyLimit } from "hono/body-limit";
import { Hono } from "hono";
import { describeRoute, loadVendor, openAPIRouteHandler, resolver, validator } from "hono-openapi";
import * as v from "valibot";
import { emailDeliveryStatus } from "./email.js";

loadVendor("valibot", { toJSONSchema: toJsonSchema as never });

declare module "hono" {
  interface ContextVariableMap {
    "lace.actor": Actor | undefined;
    "lace.requestId": string;
    "lace.sessionId": string | null | undefined;
  }
}

interface ServerModelBase {
  readonly blocks: readonly string[];
  readonly description?: string;
  readonly fields: unknown;
  readonly key: string;
  readonly label?: string;
  readonly version: number;
}

type ServerContentModel =
  | (ServerModelBase & {
      readonly kind: "collection";
      readonly listFields?: readonly string[];
      readonly route: string;
    })
  | (ServerModelBase & { readonly kind: "page"; readonly path: string });

interface ServerBlockMetadata {
  readonly type: string;
}

interface ServerConfig {
  readonly blocks?: readonly ServerBlockMetadata[];
  readonly content: readonly ServerContentModel[];
}
type ServerSchema = v.BaseSchema<unknown, unknown, v.BaseIssue<unknown>>;
type Actor = Parameters<ContentUseCases["create"]>[0]["actor"];

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
  }): void;
}

export type SensitiveRequestOperation = "auth" | "email" | "invite" | "setup" | "token" | "upload";

export interface SensitiveRequestLimit {
  readonly operation: SensitiveRequestOperation;
  /** `actor` limits count per resolved actor; `client` per trusted client address. */
  readonly scope: "actor" | "client";
}

const INVITE_LIMITED_PATH =
  /^\/api\/v1\/admin\/(?:invitations(?:\/[^/]+(?:\/resend)?)?|users\/[^/]+\/password-reset)$/u;

/**
 * Maps a request to its sensitive fixed-window limit, shared by both runtimes so
 * Node and the Worker count the same routes under the same subjects.
 */
export function sensitiveRequestLimit(
  method: string,
  pathname: string,
): SensitiveRequestLimit | undefined {
  if (pathname.startsWith("/api/auth/") && method !== "GET")
    return { operation: "auth", scope: "client" };
  if (
    method === "POST" &&
    (pathname.startsWith("/api/v1/invitations/") || pathname.startsWith("/api/v1/password-reset/"))
  )
    return { operation: "auth", scope: "client" };
  if (pathname === "/api/v1/account/password" && method === "POST")
    return { operation: "auth", scope: "actor" };
  if (pathname === "/api/v1/setup/admin") return { operation: "setup", scope: "client" };
  if (pathname.startsWith("/api/v1/admin/api-tokens") && method !== "GET")
    return { operation: "token", scope: "actor" };
  if (pathname === "/api/v1/admin/media" && method === "POST")
    return { operation: "upload", scope: "actor" };
  if (pathname === "/api/v1/admin/settings/email-test" && method === "POST")
    return { operation: "email", scope: "actor" };
  if ((method === "POST" || method === "DELETE") && INVITE_LIMITED_PATH.test(pathname))
    return { operation: "invite", scope: "actor" };
  return undefined;
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
  readonly buildSite?: BuildSiteIdentityDto | null;
  readonly auth?: AuthRouteHandler;
  readonly actors: ActorResolver;
  readonly adminAssets?: BuiltAdminResponder;
  readonly config: ServerConfig;
  readonly content: ContentUseCases;
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

class RequestValidationError extends Error {
  public constructor(readonly issues: readonly ContractValidationIssue[]) {
    super("Request validation failed.");
  }
}

class AuthorizationError extends Error {}

function pointer(path: readonly unknown[] | undefined): string {
  if (path === undefined || path.length === 0) return "";
  return path
    .map((part) =>
      typeof part === "object" && part !== null && "key" in part
        ? (part as { readonly key: unknown }).key
        : part,
    )
    .map((part) => String(part).replaceAll("~", "~0").replaceAll("/", "~1"))
    .map((part) => `/${part}`)
    .join("");
}

function standardIssues(
  issues: readonly { readonly path?: readonly unknown[] | undefined }[],
): ContractValidationIssue[] {
  return issues.map((issue) => ({
    code: "invalid_value",
    message: "The submitted value is invalid.",
    path: pointer(issue.path),
  }));
}

/**
 * Content validation messages are static text (some embed configured limits),
 * never submitted values, so they are safe to return with their pointers.
 */
function contentIssues(error: ContentValidationError): ContractValidationIssue[] {
  return error.issues.map((issue) => ({
    code: issue.code,
    message: issue.message,
    path: pointer(issue.path),
  }));
}

function invalid(message = "The submitted value is invalid.", path = ""): never {
  throw new RequestValidationError([{ code: "invalid_value", message, path }]);
}

function parse<Schema extends ServerSchema>(schema: Schema, value: unknown): v.InferOutput<Schema> {
  const result = v.safeParse(schema, value);
  if (!result.success) {
    throw new RequestValidationError(
      result.issues.map((issue) => ({
        code: issue.type,
        message: "The submitted value is invalid.",
        path: pointer(issue.path as readonly unknown[] | undefined),
      })),
    );
  }
  return result.output;
}

function response<Schema extends ServerSchema>(
  schema: Schema,
  value: unknown,
  status = 200,
  headers?: HeadersInit,
): Response {
  return Response.json(parse(schema, value), {
    ...(headers === undefined ? {} : { headers }),
    status,
  });
}

function errorResponse(error: ClassifiedError, headers?: HeadersInit): Response {
  return response(errorEnvelopeSchema, error.body, error.status, headers);
}

function notFound(): Response {
  return errorResponse(transportError("NOT_FOUND"));
}

function validationResponse(issues: readonly ContractValidationIssue[]): Response {
  return errorResponse(validationError(issues));
}

function contentModel(config: ServerConfig, key: string): ServerContentModel | undefined {
  return config.content.find((model) => model.key === key);
}

function pageModel(
  config: ServerConfig,
  key: string,
): Extract<ServerContentModel, { readonly kind: "page" }> | undefined {
  const model = contentModel(config, key);
  return model?.kind === "page" ? model : undefined;
}

function collectionModel(
  config: ServerConfig,
  key: string,
): Extract<ServerContentModel, { readonly kind: "collection" }> | undefined {
  const model = contentModel(config, key);
  return model?.kind === "collection" ? model : undefined;
}

function pagination(request: Request): {
  readonly after?: ReturnType<typeof opaqueCursor>;
  readonly limit: number;
} {
  const url = new URL(request.url);
  const after = url.searchParams.get("after") ?? undefined;
  const limit = url.searchParams.get("limit") ?? "50";
  const parsedLimit = Number(limit);
  if (!Number.isSafeInteger(parsedLimit) || parsedLimit < 1 || parsedLimit > 100)
    invalid("limit must be an integer between 1 and 100.", "/limit");
  if (after === undefined) return { limit: parsedLimit };
  parse(opaqueCursorSchema, after);
  return { after: opaqueCursor(after), limit: parsedLimit };
}

async function optionalJsonBody(request: Request): Promise<unknown> {
  if (request.headers.get("content-length") === "0") return {};
  try {
    return await request.json();
  } catch {
    if (request.headers.get("content-length") === null) return {};
    invalid("The request body must contain valid JSON.");
  }
}

function revision(
  body: { readonly expectedRevision?: number | undefined },
  request: Request,
): number {
  try {
    const ifMatch = request.headers.get("if-match") ?? undefined;
    return resolveExpectedRevision({
      ...(body.expectedRevision === undefined ? {} : { expectedRevision: body.expectedRevision }),
      ...(ifMatch === undefined ? {} : { ifMatch }),
    });
  } catch {
    return invalid("expectedRevision and If-Match must supply one matching revision.");
  }
}

function optionalIdempotencyKey(request: Request): string | undefined {
  const value = request.headers.get("idempotency-key") ?? undefined;
  return value === undefined ? undefined : parse(idempotencyKeySchema, value);
}

function modelDto(config: ServerConfig, model: ServerContentModel) {
  const definitions =
    config.blocks === undefined
      ? undefined
      : model.blocks.map((type) => config.blocks?.find((block) => block.type === type));
  if (definitions?.some((definition) => definition === undefined)) {
    throw new Error("The model references a block absent from the public configuration.");
  }
  return toContentModelDto({
    ...(definitions === undefined ? {} : { blockDefinitions: definitions as never }),
    blocks: model.blocks,
    ...(model.description === undefined ? {} : { description: model.description }),
    fields: model.fields as never,
    key: model.key,
    kind: model.kind,
    ...(model.label === undefined ? {} : { label: model.label }),
    ...(model.kind === "collection" && model.listFields !== undefined
      ? { listFields: model.listFields }
      : {}),
    ...(model.kind === "page" ? { path: model.path } : { route: model.route }),
    version: model.version,
  });
}

function publicPath(value: string): string {
  if (
    !value.startsWith("/") ||
    value.includes("?") ||
    value.includes("#") ||
    value.includes("\\") ||
    value.includes("//") ||
    /\s/u.test(value) ||
    (value.length > 1 && value.endsWith("/"))
  ) {
    invalid("The submitted value is invalid.", "/path");
  }
  return value;
}

function buildTokenDto(
  value:
    | Awaited<ReturnType<SecurityService["createBuildToken"]>>
    | Awaited<ReturnType<SecurityService["listBuildTokens"]>>[number],
) {
  return {
    capabilities: ["content:build:read"] as const,
    createdAt: toIsoTimestamp(value.createdAt),
    id: value.id,
    ...(value.lastUsedAt === undefined ? {} : { lastUsedAt: toIsoTimestamp(value.lastUsedAt) }),
    name: value.name,
    ...(value.revokedAt === undefined ? {} : { revokedAt: toIsoTimestamp(value.revokedAt) }),
    tokenPrefix: value.tokenPrefix,
  };
}

const modelKeyParams = v.strictObject({ modelKey: identifierSchemaPublic });
const entryIdParams = v.strictObject({ entryId: identifierSchemaPublic });
const mediaIdParams = v.strictObject({ mediaId: identifierSchemaPublic });
const collectionItemParams = v.strictObject({
  modelKey: identifierSchemaPublic,
  slug: identifierSchemaPublic,
});

const validationHook = ((result: {
  readonly success: boolean;
  readonly error?: readonly { readonly path?: readonly unknown[] | undefined }[] | undefined;
}) => {
  if (!result.success) return validationResponse(standardIssues(result.error ?? []));
}) as never;

function mediaByteStream(chunks: readonly Uint8Array[]) {
  return {
    async *[Symbol.asyncIterator](): AsyncGenerator<Uint8Array> {
      for (const chunk of chunks) yield chunk.slice();
    },
  };
}

function binaryResponse(
  value: Awaited<ReturnType<MediaUseCases["preview"]>> extends infer Result
    ? Exclude<Result, null>
    : never,
): Response {
  const iterator = value.body[Symbol.asyncIterator]();
  const body = new ReadableStream<Uint8Array>({
    async cancel() {
      await iterator.return?.();
    },
    async pull(controller) {
      const next = await iterator.next();
      if (next.done) controller.close();
      else controller.enqueue(next.value);
    },
  });
  return new Response(body, {
    headers: {
      "content-disposition": `inline; filename*=UTF-8''${encodeURIComponent(value.filename)}`,
      "content-type": value.mimeType,
    },
  });
}

/** Creates a portable Hono API app; runtime adapters supply every infrastructure capability. */
export function createLaceApp(input: LaceAppInput): Hono {
  if (!Number.isSafeInteger(input.maxBodyBytes) || input.maxBodyBytes < 1)
    throw new TypeError("maxBodyBytes must be a positive safe integer.");
  const app = new Hono();

  app.onError((error) =>
    error instanceof RequestValidationError
      ? validationResponse(error.issues)
      : error instanceof ContentValidationError
        ? validationResponse(contentIssues(error))
        : error instanceof AuthorizationError
          ? errorResponse(transportError("AUTHORIZATION_DENIED"))
          : error instanceof AccountError
            ? errorResponse(transportError(error.code))
            : error instanceof RateLimitExceededError
              ? errorResponse(transportError("RATE_LIMITED"), {
                  "retry-after": String(Math.max(1, Math.ceil(error.retryAfterSeconds))),
                })
              : errorResponse(classifyError(error)),
  );

  app.use(async (context, next) => {
    const requestId = input.requestIds.next();
    context.set("lace.requestId", requestId);
    const startedAt = performance.now();
    try {
      await next();
    } finally {
      context.res.headers.set("x-request-id", requestId);
      const actor = context.get("lace.actor") as Actor | undefined;
      input.logger.log({
        ...(actor === undefined ? {} : { actorId: actor.id }),
        durationMs: performance.now() - startedAt,
        method: context.req.method,
        path: context.req.path,
        requestId,
        status: context.res.status,
      });
    }
  });

  const jsonBodyLimit = bodyLimit({
    maxSize: input.maxBodyBytes,
    onError: () => errorResponse(transportError("PAYLOAD_TOO_LARGE")),
  });
  app.use((context, next) => {
    const request = context.req.raw;
    const hasBodyHeaders =
      request.headers.has("content-length") || request.headers.has("transfer-encoding");
    if (context.req.path === "/api/v1/admin/media" && context.req.method === "POST") return next();
    if (request.headers.get("content-length") === "0" && !request.headers.has("transfer-encoding"))
      return next();
    if (!hasBodyHeaders) {
      return (async () => {
        const reader = request.clone().body?.getReader();
        if (reader === undefined) return next();
        let size = 0;
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > input.maxBodyBytes) return errorResponse(transportError("PAYLOAD_TOO_LARGE"));
        }
        return next();
      })();
    }
    return jsonBodyLimit(context, next);
  });
  app.use(async (context, next) => {
    const actorLimited =
      sensitiveRequestLimit(context.req.method, context.req.path)?.scope === "actor";
    const resolvedActor = actorLimited ? await actor(context) : undefined;
    const decision = await input.rateLimiter.check({
      ...(resolvedActor === undefined ? {} : { actor: resolvedActor }),
      request: context.req.raw,
      requestId: context.get("lace.requestId") as string,
    });
    const allowed = typeof decision === "boolean" ? decision : decision.allowed;
    if (!allowed) {
      const retryAfterSeconds = typeof decision === "boolean" ? 60 : decision.retryAfterSeconds;
      return errorResponse(transportError("RATE_LIMITED"), {
        "retry-after": String(retryAfterSeconds),
      });
    }
    await next();
  });

  if (input.auth !== undefined) {
    const auth = input.auth;
    app.all("/api/auth/*", (context) => auth.fetch(context.req.raw));
  }

  async function actor(context: {
    readonly req: { readonly raw: Request };
    get(key: string): unknown;
    set(key: string, value: unknown): void;
  }): Promise<Actor> {
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
    return toAdminContentEntryDto(
      entry,
      await input.content.describeActor({
        actor: resolvedActor,
        actorId: entry.draft.updatedBy.id,
      }),
    );
  }

  app.get("/health/live", (context) => context.json({ status: "live" }));
  app.get("/health/ready", async (context) => {
    const ready = await input.readiness.isReady();
    return context.json({ status: ready ? "ready" : "not_ready" }, ready ? 200 : 503);
  });

  function security(): SecurityService {
    if (input.security === undefined) throw new AuthorizationError();
    return input.security;
  }

  function media(): MediaUseCases {
    if (input.media === undefined || input.publicBaseUrl === undefined) {
      throw new Error("Media capability is unavailable.");
    }
    return input.media;
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
    if (input.publicBaseUrl === undefined) throw new Error("Account flows are unavailable.");
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

  function invitationDto(value: InvitationView) {
    return {
      createdAt: toIsoTimestamp(value.createdAt),
      email: value.email,
      expiresAt: toIsoTimestamp(value.expiresAt),
      id: value.id,
      invitedBy: value.invitedBy,
      role: value.role,
      state: value.state,
    };
  }

  function linkIssueDto(value: LinkIssueResult) {
    return {
      delivery:
        value.delivery.status === "sent"
          ? { status: "sent" as const }
          : { reason: value.delivery.reason, status: "failed" as const },
      ...(value.link === undefined ? {} : { link: value.link }),
    };
  }

  function invitationIssueDto(value: InvitationIssueResult) {
    return { ...linkIssueDto(value), invitation: invitationDto(value.invitation) };
  }

  const noStore = { "cache-control": "no-store" };

  app.get(
    "/api/v1/setup/state",
    describeRoute({
      summary: "Read installation setup completion",
      tags: ["setup"],
      responses: {
        200: {
          content: { "application/json": { schema: resolver(setupStateSchema) } },
          description: "Minimal installation completion state",
        },
      },
    }),
    async () => {
      return response(
        setupStateSchema,
        { setupComplete: await security().isSetupComplete() },
        200,
        { "cache-control": "no-store" },
      );
    },
  );

  app.post(
    "/api/v1/setup/admin",
    validator("json", setupAdminRequestSchema, validationHook),
    async (context) => {
      try {
        const body = context.req.valid("json") as v.InferOutput<typeof setupAdminRequestSchema>;
        const created = await security().bootstrap({
          email: body.email,
          password: body.password,
          token: body.token as never,
        });
        return response(managedUserSchema, created.user, 201);
      } catch (error) {
        if (error instanceof AuthorizationError) throw error;
        return notFound();
      }
    },
  );

  app.get("/api/v1/admin/users", async (context) => {
    await usersActor(context);
    return response(managedUserListSchema, { items: await security().listUsers() });
  });
  app.get(
    "/api/v1/admin/build-site",
    describeRoute({
      summary: "Read current configured build site",
      responses: {
        200: {
          description: "Current configuration, not deployment verification",
          content: { "application/json": { schema: resolver(buildSiteSelectionSchema) } },
        },
      },
    }),
    async (context) => {
      const resolvedActor = await actor(context);
      requireContentReader(resolvedActor);
      return response(buildSiteSelectionSchema, { site: input.buildSite ?? null });
    },
  );
  app.get(
    "/api/v1/admin/session",
    describeRoute({
      summary: "Read the signed-in user and server-derived permissions",
      tags: ["admin"],
      responses: {
        200: {
          content: { "application/json": { schema: resolver(adminSessionSchema) } },
          description: "Session summary without credential material",
        },
      },
    }),
    async (context) => sessionSummary(await actor(context)),
  );
  app.get("/api/v1/admin/settings/status", async (context) => {
    await settingsActor(context);
    return response(adminSettingsStatusSchema, {
      configuredModels: input.config.content.length,
      email: emailDeliveryStatus(email),
      engineVersion: input.environment.engineVersion,
      ready: await input.readiness.isReady(),
    });
  });
  app.post(
    "/api/v1/admin/settings/email-test",
    describeRoute({
      summary: "Send a test email to the signed-in administrator",
      tags: ["admin"],
      responses: {
        200: {
          content: { "application/json": { schema: resolver(emailTestResultSchema) } },
          description: "Closed delivery outcome; failed sends are reported, not raised",
        },
      },
    }),
    validator("json", emailTestRequestSchema, validationHook),
    async (context) => {
      const resolvedActor = await settingsActor(context);
      const outcome = await sendTestEmail({
        actor: resolvedActor,
        email,
        installationUrl: input.publicBaseUrl ?? new URL(context.req.url).origin,
        users: security(),
      });
      return response(emailTestResultSchema, outcome);
    },
  );
  app.post(
    "/api/v1/invitations/inspect",
    describeRoute({
      summary: "Inspect an invitation token",
      tags: ["account"],
      responses: {
        200: {
          content: { "application/json": { schema: resolver(invitationInspectResultSchema) } },
          description: "Invited email, role and expiry",
        },
        410: {
          content: { "application/json": { schema: resolver(errorEnvelopeSchema) } },
          description: "Unknown, expired, revoked or accepted invitation",
        },
      },
    }),
    validator("json", invitationInspectRequestSchema, validationHook),
    async (context) => {
      const body = context.req.valid("json") as v.InferOutput<
        typeof invitationInspectRequestSchema
      >;
      const found = await accounts().inspectInvitation(body);
      return response(
        invitationInspectResultSchema,
        { email: found.email, expiresAt: toIsoTimestamp(found.expiresAt), role: found.role },
        200,
        noStore,
      );
    },
  );
  app.post(
    "/api/v1/invitations/accept",
    describeRoute({
      summary: "Accept an invitation by choosing a password",
      tags: ["account"],
      responses: {
        201: {
          content: { "application/json": { schema: resolver(invitationAcceptResultSchema) } },
          description: "Account created; sign in with the returned email",
        },
        409: {
          content: { "application/json": { schema: resolver(errorEnvelopeSchema) } },
          description: "An account for the address already exists",
        },
        410: {
          content: { "application/json": { schema: resolver(errorEnvelopeSchema) } },
          description: "Unknown, expired, revoked or accepted invitation",
        },
      },
    }),
    validator("json", invitationAcceptRequestSchema, validationHook),
    async (context) => {
      const body = context.req.valid("json") as v.InferOutput<typeof invitationAcceptRequestSchema>;
      return response(
        invitationAcceptResultSchema,
        await accounts().acceptInvitation({
          ...(body.displayName === undefined ? {} : { displayName: body.displayName }),
          password: body.password,
          token: body.token,
        }),
        201,
        noStore,
      );
    },
  );
  app.post(
    "/api/v1/password-reset/request",
    describeRoute({
      summary: "Request a password reset link",
      tags: ["account"],
      responses: {
        202: { description: "Accepted; identical whether or not the address has an account" },
      },
    }),
    validator("json", passwordResetRequestSchema, validationHook),
    async (context) => {
      const body = context.req.valid("json") as v.InferOutput<typeof passwordResetRequestSchema>;
      await accounts().requestPasswordReset({ defer: deferTask(context), email: body.email });
      return new Response(null, { headers: noStore, status: 202 });
    },
  );
  app.post(
    "/api/v1/password-reset/confirm",
    describeRoute({
      summary: "Choose a new password with a reset token",
      tags: ["account"],
      responses: {
        204: { description: "Password replaced and every session ended" },
        410: {
          content: { "application/json": { schema: resolver(errorEnvelopeSchema) } },
          description: "Unknown, expired, consumed or superseded reset link",
        },
      },
    }),
    validator("json", passwordResetConfirmRequestSchema, validationHook),
    async (context) => {
      const body = context.req.valid("json") as v.InferOutput<
        typeof passwordResetConfirmRequestSchema
      >;
      await accounts().confirmPasswordReset(body);
      return new Response(null, { headers: noStore, status: 204 });
    },
  );

  app.patch(
    "/api/v1/account",
    describeRoute({
      summary: "Change the signed-in user's display name",
      tags: ["account"],
      responses: {
        200: {
          content: { "application/json": { schema: resolver(adminSessionSchema) } },
          description: "Updated session summary",
        },
      },
    }),
    validator("json", accountProfileUpdateRequestSchema, validationHook),
    async (context) => {
      const resolvedActor = await actor(context);
      const body = context.req.valid("json") as v.InferOutput<
        typeof accountProfileUpdateRequestSchema
      >;
      await accounts().updateDisplayName(resolvedActor, body.displayName);
      return sessionSummary(resolvedActor);
    },
  );
  app.post(
    "/api/v1/account/password",
    describeRoute({
      summary: "Change the signed-in user's password",
      tags: ["account"],
      responses: {
        200: {
          content: { "application/json": { schema: resolver(sessionRevocationResultSchema) } },
          description: "Password changed; count of other sessions ended",
        },
        400: {
          content: { "application/json": { schema: resolver(errorEnvelopeSchema) } },
          description: "The current password is incorrect",
        },
      },
    }),
    validator("json", accountPasswordChangeRequestSchema, validationHook),
    async (context) => {
      const resolvedActor = await actor(context);
      const body = context.req.valid("json") as v.InferOutput<
        typeof accountPasswordChangeRequestSchema
      >;
      return response(
        sessionRevocationResultSchema,
        await accounts().changePassword(resolvedActor, await currentSessionId(context), {
          currentPassword: body.currentPassword,
          defer: deferTask(context),
          newPassword: body.newPassword,
          signOutOtherSessions: body.signOutOtherSessions,
        }),
      );
    },
  );
  app.get(
    "/api/v1/account/sessions",
    describeRoute({
      summary: "List the signed-in user's sessions",
      tags: ["account"],
      responses: {
        200: {
          content: { "application/json": { schema: resolver(accountSessionListSchema) } },
          description: "Sessions without tokens or IP addresses",
        },
      },
    }),
    async (context) => {
      const resolvedActor = await actor(context);
      const items = await accounts().listSessions(resolvedActor, await currentSessionId(context));
      return response(
        accountSessionListSchema,
        {
          items: items.map((item) => ({
            browser: item.browser,
            createdAt: toIsoTimestamp(item.createdAt),
            current: item.current,
            id: item.id,
            lastActiveAt: toIsoTimestamp(item.lastActiveAt),
            os: item.os,
          })),
        },
        200,
        noStore,
      );
    },
  );
  app.delete(
    "/api/v1/account/sessions/:sessionId",
    describeRoute({
      summary: "End another session of the signed-in user",
      tags: ["account"],
      responses: {
        204: { description: "Session ended" },
        404: {
          content: { "application/json": { schema: resolver(errorEnvelopeSchema) } },
          description: "No such session for this user",
        },
        409: {
          content: { "application/json": { schema: resolver(errorEnvelopeSchema) } },
          description: "The current session is ended by signing out instead",
        },
      },
    }),
    async (context) => {
      const resolvedActor = await actor(context);
      const sessionId = parse(identifierSchemaPublic, context.req.param("sessionId"));
      await accounts().deleteSession(resolvedActor, await currentSessionId(context), sessionId);
      return new Response(null, { status: 204 });
    },
  );
  app.post(
    "/api/v1/account/sessions/revoke-others",
    describeRoute({
      summary: "End every other session of the signed-in user",
      tags: ["account"],
      requestBody: {
        content: { "application/json": { schema: resolver(sessionRevokeRequestSchema) } },
      },
      responses: {
        200: {
          content: { "application/json": { schema: resolver(sessionRevocationResultSchema) } },
          description: "Count of sessions ended",
        },
      },
    }),
    async (context) => {
      const resolvedActor = await actor(context);
      parse(sessionRevokeRequestSchema, await optionalJsonBody(context.req.raw));
      return response(
        sessionRevocationResultSchema,
        await accounts().deleteOtherSessions(resolvedActor, await currentSessionId(context)),
      );
    },
  );

  app.get(
    "/api/v1/admin/invitations",
    describeRoute({
      summary: "List pending and expired invitations",
      tags: ["admin"],
      responses: {
        200: {
          content: { "application/json": { schema: resolver(invitationListSchema) } },
          description: "Invitations without tokens or links",
        },
      },
    }),
    async (context) => {
      const items = await accounts().listInvitations(await actor(context));
      return response(invitationListSchema, { items: items.map(invitationDto) }, 200, noStore);
    },
  );
  app.post(
    "/api/v1/admin/invitations",
    describeRoute({
      summary: "Invite an email address with a role",
      tags: ["admin"],
      responses: {
        201: {
          content: { "application/json": { schema: resolver(invitationIssueResultSchema) } },
          description: "Invitation created; the link is present only when email was not sent",
        },
        409: {
          content: { "application/json": { schema: resolver(errorEnvelopeSchema) } },
          description: "The address has an account or an active invitation",
        },
      },
    }),
    validator("json", invitationCreateRequestSchema, validationHook),
    async (context) => {
      const resolvedActor = await actor(context);
      const body = context.req.valid("json") as v.InferOutput<typeof invitationCreateRequestSchema>;
      return response(
        invitationIssueResultSchema,
        invitationIssueDto(await accounts().invite(resolvedActor, body)),
        201,
        noStore,
      );
    },
  );
  app.post(
    "/api/v1/admin/invitations/:invitationId/resend",
    describeRoute({
      summary: "Resend an invitation with a new link",
      tags: ["admin"],
      requestBody: {
        content: { "application/json": { schema: resolver(invitationResendRequestSchema) } },
      },
      responses: {
        200: {
          content: { "application/json": { schema: resolver(invitationIssueResultSchema) } },
          description: "Invitation reissued; the link is present only when email was not sent",
        },
      },
    }),
    async (context) => {
      const resolvedActor = await actor(context);
      parse(invitationResendRequestSchema, await optionalJsonBody(context.req.raw));
      const invitationId = parse(identifierSchemaPublic, context.req.param("invitationId"));
      return response(
        invitationIssueResultSchema,
        invitationIssueDto(await accounts().resendInvitation(resolvedActor, invitationId)),
        200,
        noStore,
      );
    },
  );
  app.delete(
    "/api/v1/admin/invitations/:invitationId",
    describeRoute({
      summary: "Revoke an invitation",
      tags: ["admin"],
      responses: { 204: { description: "Invitation revoked" } },
    }),
    async (context) => {
      const resolvedActor = await actor(context);
      const invitationId = parse(identifierSchemaPublic, context.req.param("invitationId"));
      await accounts().revokeInvitation(resolvedActor, invitationId);
      return new Response(null, { status: 204 });
    },
  );
  app.post(
    "/api/v1/admin/users/:userId/password-reset",
    describeRoute({
      summary: "Send a password reset to a user",
      tags: ["admin"],
      requestBody: {
        content: { "application/json": { schema: resolver(adminPasswordResetRequestSchema) } },
      },
      responses: {
        200: {
          content: { "application/json": { schema: resolver(adminPasswordResetResultSchema) } },
          description: "Reset issued; the link is present only when email was not sent",
        },
      },
    }),
    async (context) => {
      const resolvedActor = await actor(context);
      parse(adminPasswordResetRequestSchema, await optionalJsonBody(context.req.raw));
      const userId = parse(identifierSchemaPublic, context.req.param("userId"));
      return response(
        adminPasswordResetResultSchema,
        linkIssueDto(await accounts().sendPasswordReset(resolvedActor, userId)),
        200,
        noStore,
      );
    },
  );
  app.post(
    "/api/v1/admin/users/:userId/sessions/revoke",
    describeRoute({
      summary: "Sign a user out everywhere",
      tags: ["admin"],
      requestBody: {
        content: { "application/json": { schema: resolver(sessionRevokeRequestSchema) } },
      },
      responses: {
        200: {
          content: { "application/json": { schema: resolver(sessionRevocationResultSchema) } },
          description: "Count of sessions ended",
        },
      },
    }),
    async (context) => {
      const resolvedActor = await actor(context);
      parse(sessionRevokeRequestSchema, await optionalJsonBody(context.req.raw));
      const userId = parse(identifierSchemaPublic, context.req.param("userId"));
      return response(
        sessionRevocationResultSchema,
        await accounts().signOutUser(resolvedActor, userId),
      );
    },
  );
  app.patch(
    "/api/v1/admin/users/:userId",
    validator("json", userUpdateRequestSchema, validationHook),
    async (context) => {
      await usersActor(context);
      const body = context.req.valid("json") as v.InferOutput<typeof userUpdateRequestSchema>;
      const updated = await security().updateUser({
        ...(body.disabled === undefined ? {} : { disabled: body.disabled }),
        ...(body.role === undefined ? {} : { role: body.role }),
        userId: context.req.param("userId"),
      });
      return updated === null ? notFound() : response(managedUserSchema, updated);
    },
  );
  app.get("/api/v1/admin/api-tokens", async (context) => {
    await settingsActor(context);
    return response(buildTokenListSchema, {
      items: (await security().listBuildTokens()).map(buildTokenDto),
    });
  });
  app.post(
    "/api/v1/admin/api-tokens",
    validator("json", buildTokenCreateRequestSchema, validationHook),
    async (context) => {
      await settingsActor(context);
      const body = context.req.valid("json") as v.InferOutput<typeof buildTokenCreateRequestSchema>;
      const token = await security().createBuildToken({
        name: body.name,
        now: Date.now() as never,
      });
      return response(
        buildTokenCreatedSchema,
        { ...buildTokenDto(token), token: token.token },
        201,
      );
    },
  );
  app.delete("/api/v1/admin/api-tokens/:tokenId", async (context) => {
    await settingsActor(context);
    const token = await security().revokeBuildToken({
      now: Date.now() as never,
      tokenId: context.req.param("tokenId"),
    });
    return token === null ? notFound() : response(buildTokenSchema, buildTokenDto(token));
  });

  app.get(
    "/api/v1/admin/site-builds",
    describeRoute({
      responses: {
        200: {
          content: { "application/json": { schema: resolver(siteBuildListSchema) } },
          description: "Recent site builds",
        },
      },
      summary: "List site builds",
      tags: ["admin"],
    }),
    async (context) => {
      const resolvedActor = await actor(context);
      if (input.builds === undefined) throw new Error("Build reads are unavailable.");
      const items = await input.builds.list(resolvedActor);
      return response(siteBuildListSchema, { items: items.map(toSiteBuildRecordDto) });
    },
  );
  app.get(
    "/api/v1/admin/site-builds/:buildId",
    describeRoute({
      responses: {
        200: {
          content: { "application/json": { schema: resolver(siteBuildRecordSchema) } },
          description: "Site build detail",
        },
      },
      summary: "Get a site build",
      tags: ["admin"],
    }),
    async (context) => {
      const resolvedActor = await actor(context);
      const buildId = parse(identifierSchemaPublic, context.req.param("buildId"));
      if (input.builds === undefined) throw new Error("Build reads are unavailable.");
      const build = await input.builds.get(resolvedActor, buildId);
      return build === null
        ? notFound()
        : response(siteBuildRecordSchema, toSiteBuildRecordDto(build));
    },
  );
  app.post(
    "/api/v1/admin/builds",
    describeRoute({
      requestBody: { content: { "application/json": { schema: resolver(buildRequestSchema) } } },
      responses: {
        202: {
          content: { "application/json": { schema: resolver(buildQueueReceiptSchema) } },
          description: "Build request queued",
        },
      },
      summary: "Request a site build",
      tags: ["admin"],
    }),
    async (context) => {
      const resolvedActor = await settingsActor(context);
      parse(buildRequestSchema, await optionalJsonBody(context.req.raw));
      if (input.builds === undefined) throw new Error("Build commands are unavailable.");
      return response(buildQueueReceiptSchema, await input.builds.request(resolvedActor), 202);
    },
  );
  app.post(
    "/api/v1/admin/builds/:buildId/retry",
    describeRoute({
      requestBody: { content: { "application/json": { schema: resolver(buildRequestSchema) } } },
      responses: {
        202: {
          content: { "application/json": { schema: resolver(buildQueueReceiptSchema) } },
          description: "Failed build retry queued",
        },
      },
      summary: "Retry a failed site build",
      tags: ["admin"],
    }),
    async (context) => {
      const resolvedActor = await settingsActor(context);
      parse(buildRequestSchema, await optionalJsonBody(context.req.raw));
      const buildId = parse(identifierSchemaPublic, context.req.param("buildId"));
      if (input.builds === undefined) throw new Error("Build commands are unavailable.");
      return response(
        buildQueueReceiptSchema,
        await input.builds.retry(resolvedActor, buildId),
        202,
      );
    },
  );

  app.get(
    "/api/v1/admin/media",
    describeRoute({
      responses: {
        200: {
          content: { "application/json": { schema: resolver(mediaListSchema) } },
          description: "Media page",
        },
      },
      summary: "List media",
      tags: ["admin"],
    }),
    validator("query", mediaListQuerySchema, validationHook),
    async (context) => {
      const query = context.req.valid("query") as v.InferOutput<typeof mediaListQuerySchema>;
      const page = await media().list({
        actor: await actor(context),
        ...pagination(context.req.raw),
        ...(query.q === undefined || query.q.length === 0 ? {} : { q: query.q }),
        ...(query.sort === undefined ? {} : { sort: query.sort }),
        ...(query.type === undefined ? {} : { type: query.type }),
      });
      return response(mediaListSchema, {
        items: page.items.map(mediaDto),
        ...(page.nextCursor === undefined ? {} : { nextCursor: page.nextCursor }),
      });
    },
  );

  app.post(
    "/api/v1/admin/media",
    describeRoute({
      responses: {
        201: {
          content: { "application/json": { schema: resolver(mediaMetadataSchema) } },
          description: "Created media",
        },
      },
      summary: "Upload media",
      tags: ["admin"],
    }),
    async (context) => {
      const resolvedActor = await actor(context);
      try {
        let upload:
          | { readonly chunks: readonly Uint8Array[]; readonly filename: string }
          | undefined;
        for await (const part of parseMultipartRequest(context.req.raw, {
          maxFileSize: MAX_MEDIA_BYTES,
        })) {
          if (
            !part.isFile ||
            part.name !== "file" ||
            part.filename === undefined ||
            upload !== undefined
          ) {
            invalid("The submitted value is invalid.", "/file");
          }
          upload = { chunks: part.content, filename: part.filename };
        }
        if (upload === undefined) invalid("The submitted value is invalid.", "/file");
        const created = await media().create({
          actor: resolvedActor,
          body: mediaByteStream(upload.chunks),
          filename: upload.filename,
        });
        return response(mediaMetadataSchema, mediaDto(created), 201);
      } catch (error) {
        if (error instanceof MaxFileSizeExceededError) {
          return errorResponse(transportError("PAYLOAD_TOO_LARGE"));
        }
        if (error instanceof MultipartParseError) {
          return validationResponse([
            { code: "invalid_value", message: "The submitted value is invalid.", path: "/file" },
          ]);
        }
        throw error;
      }
    },
  );

  app.delete(
    "/api/v1/admin/media/:mediaId",
    describeRoute({
      responses: {
        202: {
          content: { "application/json": { schema: resolver(mediaMetadataSchema) } },
          description: "Deletion requested",
        },
      },
      summary: "Request media deletion",
      tags: ["admin"],
    }),
    validator("param", mediaIdParams, validationHook),
    async (context) => {
      const deleted = await media().requestDeletion({
        actor: await actor(context),
        mediaId: context.req.param("mediaId") as never,
      });
      return response(mediaMetadataSchema, mediaDto(deleted), 202);
    },
  );

  app.get(
    "/api/v1/admin/media/:mediaId",
    describeRoute({
      responses: {
        200: {
          content: { "application/json": { schema: resolver(mediaDetailSchema) } },
          description: "Media item with the entries that use it",
        },
      },
      summary: "Get media details",
      tags: ["admin"],
    }),
    validator("param", mediaIdParams, validationHook),
    async (context) => {
      const detail = await media().get({
        actor: await actor(context),
        mediaId: context.req.param("mediaId") as never,
      });
      return detail === null
        ? notFound()
        : response(
            mediaDetailSchema,
            toMediaDetailDto(detail, mediaUrl(input.publicBaseUrl!, detail.id)),
          );
    },
  );

  app.post(
    "/api/v1/admin/media/:mediaId/retry-deletion",
    describeRoute({
      responses: {
        202: {
          content: { "application/json": { schema: resolver(mediaMetadataSchema) } },
          description: "Deletion retry requested",
        },
      },
      summary: "Retry media deletion",
      tags: ["admin"],
    }),
    validator("param", mediaIdParams, validationHook),
    async (context) => {
      const retried = await media().retryDeletion({
        actor: await actor(context),
        mediaId: context.req.param("mediaId") as never,
      });
      return response(mediaMetadataSchema, mediaDto(retried), 202);
    },
  );

  app.get(
    "/api/v1/public/media/:mediaId",
    describeRoute({ summary: "Read published media", tags: ["public"] }),
    validator("param", mediaIdParams, validationHook),
    async (context) => {
      const result = await media().readPublic({ mediaId: context.req.param("mediaId") as never });
      return result === null ? notFound() : binaryResponse(result);
    },
  );

  app.get(
    "/api/v1/admin/media/:mediaId/preview",
    describeRoute({ summary: "Preview media", tags: ["admin"] }),
    validator("param", mediaIdParams, validationHook),
    async (context) => {
      const result = await media().preview({
        actor: await actor(context),
        mediaId: context.req.param("mediaId") as never,
      });
      return result === null ? notFound() : binaryResponse(result);
    },
  );

  app.get(
    "/api/v1/admin/content-models",
    describeRoute({
      responses: {
        200: {
          content: { "application/json": { schema: resolver(contentModelListSchema) } },
          description: "Content models",
        },
      },
      summary: "List content models",
      tags: ["admin"],
    }),
    async (context) => {
      await actor(context);
      return response(contentModelListSchema, {
        items: input.config.content.map((model) => modelDto(input.config, model)),
      });
    },
  );

  app.get(
    "/api/v1/admin/models/:modelKey/entries",
    describeRoute({
      responses: {
        200: {
          content: { "application/json": { schema: resolver(contentEntryListSchema) } },
          description: "Content entry page with per-status totals",
        },
      },
      summary: "List content entries",
      tags: ["admin"],
    }),
    validator("param", modelKeyParams, validationHook),
    validator("query", contentEntryListQuerySchema, validationHook),
    async (context) => {
      const modelKey = context.req.param("modelKey");
      if (contentModel(input.config, modelKey) === undefined) return notFound();
      const query = context.req.valid("query") as v.InferOutput<typeof contentEntryListQuerySchema>;
      const page = await input.content.list({
        actor: await actor(context),
        modelKey,
        ...pagination(context.req.raw),
        ...(query.q === undefined || query.q.length === 0 ? {} : { q: query.q }),
        ...(query.sort === undefined ? {} : { sort: query.sort }),
        ...(query.status === undefined ? {} : { status: query.status }),
      });
      return response(contentEntryListSchema, {
        items: page.items.map((entry) => ({
          draftRevision: entry.draftRevision,
          id: entry.id,
          listValues: entry.listValues,
          modelKey: entry.modelKey,
          ...(entry.publishedAt === undefined
            ? {}
            : { publishedAt: toIsoTimestamp(entry.publishedAt) }),
          ...(entry.publishedSnapshotId === undefined
            ? {}
            : { publishedSnapshotId: entry.publishedSnapshotId }),
          ...(entry.slug === undefined ? {} : { slug: entry.slug }),
          status: entry.status,
          title: entry.title,
          updatedAt: toIsoTimestamp(entry.updatedAt),
          updatedBy: entry.updatedBy,
        })),
        ...(page.nextCursor === undefined ? {} : { nextCursor: page.nextCursor }),
        totals: page.totals,
      });
    },
  );

  app.post(
    "/api/v1/admin/models/:modelKey/entries",
    describeRoute({
      requestBody: {
        content: { "application/json": { schema: resolver(createContentEntryRequestSchema) } },
      },
      responses: {
        201: {
          content: { "application/json": { schema: resolver(adminContentEntrySchema) } },
          description: "Created entry",
        },
      },
      summary: "Create content entry",
      tags: ["admin"],
    }),
    validator("param", modelKeyParams, validationHook),
    validator("json", createContentEntryRequestSchema, validationHook),
    async (context) => {
      const modelKey = context.req.param("modelKey");
      if (contentModel(input.config, modelKey) === undefined) return notFound();
      const body = context.req.valid("json") as v.InferOutput<
        typeof createContentEntryRequestSchema
      >;
      const { blocks, fields, slug, title } = body;
      const resolvedActor = await actor(context);
      const entry = await input.content.create({
        actor: resolvedActor,
        modelKey,
        blocks: blocks.map((block) => ({ ...block, key: block.key as never })),
        fields,
        ...(slug === undefined ? {} : { slug }),
        title,
      });
      return response(adminContentEntrySchema, await adminEntryDto(resolvedActor, entry), 201);
    },
  );

  app.get(
    "/api/v1/admin/entries/:entryId",
    describeRoute({
      responses: {
        200: {
          content: { "application/json": { schema: resolver(adminContentEntrySchema) } },
          description: "Content entry with its last editor",
        },
      },
      summary: "Load content entry",
      tags: ["admin"],
    }),
    validator("param", entryIdParams, validationHook),
    async (context) => {
      const resolvedActor = await actor(context);
      const entry = await input.content.load({
        actor: resolvedActor,
        entryId: context.req.param("entryId") as never,
      });
      return entry === null
        ? notFound()
        : response(adminContentEntrySchema, await adminEntryDto(resolvedActor, entry));
    },
  );

  app.put(
    "/api/v1/admin/entries/:entryId/draft",
    describeRoute({
      requestBody: {
        content: { "application/json": { schema: resolver(saveDraftRequestSchema) } },
      },
      responses: {
        200: {
          content: { "application/json": { schema: resolver(adminContentEntrySchema) } },
          description: "Saved entry",
        },
      },
      summary: "Save complete draft",
      tags: ["admin"],
    }),
    validator("param", entryIdParams, validationHook),
    validator("json", saveDraftRequestSchema, validationHook),
    async (context) => {
      const body = context.req.valid("json") as v.InferOutput<typeof saveDraftRequestSchema>;
      const resolvedActor = await actor(context);
      const entry = await input.content.save({
        actor: resolvedActor,
        blocks: body.blocks.map((block) => ({ ...block, key: block.key as never })),
        entryId: context.req.param("entryId") as never,
        expectedRevision: revision(body, context.req.raw),
        fields: body.fields,
        ...(body.slug === undefined ? {} : { slug: body.slug }),
        title: body.title,
      });
      return response(adminContentEntrySchema, await adminEntryDto(resolvedActor, entry));
    },
  );

  app.post(
    "/api/v1/admin/entries/:entryId/publish",
    describeRoute({
      requestBody: {
        content: { "application/json": { schema: resolver(publishContentEntryRequestSchema) } },
      },
      responses: {
        200: {
          content: { "application/json": { schema: resolver(publishContentEntryResultSchema) } },
          description: "Publication and build dispatch outcome",
        },
      },
      summary: "Publish content entry",
      tags: ["admin"],
    }),
    validator("param", entryIdParams, validationHook),
    validator("json", publishContentEntryRequestSchema, validationHook),
    async (context) => {
      const body = context.req.valid("json") as v.InferOutput<
        typeof publishContentEntryRequestSchema
      >;
      const idempotencyKey = optionalIdempotencyKey(context.req.raw);
      const resolvedActor = await actor(context);
      const published = await input.content.publish({
        actor: resolvedActor,
        entryId: context.req.param("entryId") as never,
        expectedRevision: revision(body, context.req.raw),
        ...(idempotencyKey === undefined ? {} : { idempotencyKey }),
      });
      return response(
        publishContentEntryResultSchema,
        toPublishContentEntryResultDto({
          ...published,
          updatedBy: await input.content.describeActor({
            actor: resolvedActor,
            actorId: published.entry.draft.updatedBy.id,
          }),
        }),
      );
    },
  );

  app.delete(
    "/api/v1/admin/entries/:entryId",
    describeRoute({ summary: "Delete content entry", tags: ["admin"] }),
    validator("param", entryIdParams, validationHook),
    async (context) => {
      const body = parse(deleteContentEntryRequestSchema, await optionalJsonBody(context.req.raw));
      await input.content.delete({
        actor: await actor(context),
        entryId: context.req.param("entryId") as never,
        expectedRevision: revision(body, context.req.raw),
      });
      return new Response(null, { status: 204 });
    },
  );

  app.get(
    "/api/v1/public/pages/:modelKey",
    describeRoute({ summary: "Read a published page", tags: ["public"] }),
    validator("param", modelKeyParams, validationHook),
    async (context) => {
      const model = pageModel(input.config, context.req.param("modelKey"));
      if (model === undefined) return notFound();
      const entry = await input.publicContent.loadPublic(model.path);
      return entry === null
        ? notFound()
        : response(publicContentEntrySchema, {
            entry: toContentEntryDto(entry.entry),
            path: entry.path,
          });
    },
  );

  app.get(
    "/api/v1/public/collections/:modelKey",
    describeRoute({ summary: "List published collection entries", tags: ["public"] }),
    validator("param", modelKeyParams, validationHook),
    async (context) => {
      const model = collectionModel(input.config, context.req.param("modelKey"));
      if (model === undefined) return notFound();
      const page = await input.publicContent.listPublic({
        modelKey: model.key as never,
        ...pagination(context.req.raw),
      });
      return response(publicContentListSchema, {
        items: page.items.map(({ entry, path }) => ({ entry: toContentEntryDto(entry), path })),
        ...(page.nextCursor === undefined ? {} : { nextCursor: page.nextCursor }),
      });
    },
  );

  app.get(
    "/api/v1/public/collections/:modelKey/:slug",
    describeRoute({ summary: "Read a published collection entry", tags: ["public"] }),
    validator("param", collectionItemParams, validationHook),
    async (context) => {
      const model = collectionModel(input.config, context.req.param("modelKey"));
      if (model === undefined) return notFound();
      let path: string;
      try {
        const slug = context.req.param("slug");
        if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(slug))
          invalid("The submitted value is invalid.", "/slug");
        path = model.route.replace(":slug", slug);
      } catch {
        return validationResponse([
          { code: "invalid_value", message: "The submitted value is invalid.", path: "/slug" },
        ]);
      }
      const entry = await input.publicContent.loadPublic(path);
      return entry === null
        ? notFound()
        : response(publicContentEntrySchema, {
            entry: toContentEntryDto(entry.entry),
            path: entry.path,
          });
    },
  );

  app.get(
    "/api/v1/public/content/by-path",
    describeRoute({ summary: "Read published content by path", tags: ["public"] }),
    async (context) => {
      const suppliedPath = new URL(context.req.raw.url).searchParams.get("path");
      if (suppliedPath === null)
        return validationResponse([
          { code: "invalid_value", message: "The submitted value is invalid.", path: "/path" },
        ]);
      let path: string;
      try {
        path = publicPath(suppliedPath);
      } catch {
        return validationResponse([
          { code: "invalid_value", message: "The submitted value is invalid.", path: "/path" },
        ]);
      }
      const entry = await input.publicContent.loadPublic(path);
      return entry === null
        ? notFound()
        : response(publicContentEntrySchema, {
            entry: toContentEntryDto(entry.entry),
            path: entry.path,
          });
    },
  );

  app.get(
    "/api/v1/public/build-export",
    describeRoute({
      responses: {
        200: {
          content: { "application/json": { schema: resolver(buildExportSchema) } },
          description: "Published build export",
        },
      },
      summary: "Read published build export",
      tags: ["public"],
    }),
    async (context) => {
      if (input.security !== undefined) {
        const authorization = context.req.header("authorization");
        if (
          authorization === undefined ||
          !authorization.startsWith("Bearer ") ||
          !(await input.security.verifyBuildToken({
            now: Date.now() as never,
            token: authorization.slice(7) as never,
          }))
        )
          throw new AuthorizationError();
      }
      const version = await input.publicContent.publishedContentVersion();
      const etag = entityTagForVersion(version);
      const suppliedTag = context.req.header("if-none-match") ?? undefined;
      if (suppliedTag !== undefined) {
        try {
          parse(entityTagSchema, suppliedTag);
        } catch (error) {
          if (error instanceof RequestValidationError) return validationResponse(error.issues);
          throw error;
        }
        if (versionFromEntityTag(suppliedTag) === version)
          return new Response(null, { headers: { etag }, status: 304 });
      }
      const buildExport = await input.publicContent.exportBuildContent();
      return response(buildExportSchema, toBuildExportDto(buildExport), 200, {
        etag: entityTagForVersion(buildExport.version),
      });
    },
  );

  app.get(
    "/api/v1/openapi.json",
    openAPIRouteHandler(app, {
      documentation: {
        info: { title: input.environment.openApiTitle, version: input.environment.engineVersion },
        openapi: "3.1.0",
      },
    }),
  );

  app.notFound(async (context) => {
    if (
      input.adminAssets !== undefined &&
      !context.req.path.startsWith("/api/") &&
      context.req.path !== "/health/live" &&
      context.req.path !== "/health/ready"
    )
      return input.adminAssets.fetch(context.req.raw);
    return notFound();
  });

  return app;
}
