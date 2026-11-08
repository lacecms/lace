import { expect } from "vitest";
import { createLaceApp } from "../index.js";
import {
  AccountUseCases,
  ContentUseCases,
  ContentLinkUseCases,
  MediaUseCases,
  opaqueTokenSecret,
  unconfiguredEmailSender,
} from "@lacecms/application";
import { defineCollection, defineConfig, definePage } from "@lacecms/config";
import { defineBlock, field } from "@lacecms/content";
import { unixMilliseconds } from "@lacecms/domain";
import {
  DeterministicClock,
  DeterministicIdGenerator,
  InMemoryContentStore,
  InMemoryObjectStorage,
  admin,
  delegatedActor,
  editor,
  fakePort,
  testActor,
} from "@lacecms/test-utils";

import type { LaceAppInput } from "../index.js";
import type { Actor, Role } from "@lacecms/domain";
import type {
  ImportTokenCapabilities,
  ImportTokenMetadata,
  SecurityService,
} from "@lacecms/application";

type App = ReturnType<typeof createLaceApp>;
type ConfigInput = Parameters<typeof defineConfig>[0];
type FixtureOptions = Partial<
  Pick<
    LaceAppInput,
    | "apiDocsEnabled"
    | "publicBaseUrl"
    | "auth"
    | "oauthConnections"
    | "mcp"
    | "mcpEnabled"
    | "maxBodyBytes"
    | "builds"
    | "buildSite"
    | "email"
    | "rateLimiter"
    | "sensitiveLimiter"
    | "defer"
    | "importActors"
  >
> & {
  actor?: Actor | null;
  resolveActor?: LaceAppInput["actors"]["resolve"];
  ready?: boolean;
  allowed?: boolean;
  models?: ConfigInput["content"];
  blocks?: ConfigInput["blocks"];
  security?: Partial<SecurityService>;
  sessionId?: string;
  linkReads?: ConstructorParameters<typeof ContentLinkUseCases>[0];
  listQueryLimits?: ConstructorParameters<typeof ContentUseCases>[0]["listQueryLimits"];
};

export { admin, editor };

export async function fixture({
  actor = admin,
  apiDocsEnabled,
  publicBaseUrl = "https://lace.test/",
  resolveActor,
  auth,
  oauthConnections,
  mcp,
  mcpEnabled,
  ready = true,
  allowed = true,
  maxBodyBytes = 256,
  models,
  blocks = [],
  builds,
  security,
  buildSite,
  email,
  rateLimiter,
  sessionId,
  sensitiveLimiter,
  defer,
  linkReads,
  listQueryLimits,
  importActors,
}: FixtureOptions = {}) {
  const config = await defineConfig({
    blocks: [
      defineBlock({
        fields: { heading: field.text({ required: true }) },
        type: "hero",
        version: 1,
      }),
      defineBlock({ fields: { body: field.richText() }, type: "richText", version: 1 }),
      ...blocks,
    ],
    content: models ?? [
      definePage({ key: "home", path: "/", version: 1 }),
      defineCollection({
        blocks: ["hero"],
        fields: { author: field.text(), image: field.media() },
        key: "posts",
        listFields: ["author"],
        route: "/blog/:slug",
        version: 1,
      }),
    ],
  });
  const store = new InMemoryContentStore();
  const storage = new InMemoryObjectStorage();
  const content = new ContentUseCases({
    ...(listQueryLimits === undefined ? {} : { listQueryLimits }),
    clock: new DeterministicClock(unixMilliseconds(1)),
    config: config.runtime,
    content: store,
    idGenerator: new DeterministicIdGenerator("server"),
    media: store,
  });
  const logs: Parameters<LaceAppInput["logger"]["log"]>[0][] = [];
  const media = new MediaUseCases({
    clock: new DeterministicClock(unixMilliseconds(1)),
    drafts: content,
    idGenerator: new DeterministicIdGenerator("media"),
    imageInspector: {
      async inspect() {
        return { height: 1, width: 1 };
      },
    },
    logger: { error() {} },
    media: store,
    publicMedia: store,
    storage,
  });
  let exportLoads = 0;
  const securityPort =
    security === undefined ? undefined : fakePort<SecurityService>("SecurityService", security);
  const app = createLaceApp({
    ...(apiDocsEnabled === undefined ? {} : { apiDocsEnabled }),
    ...(auth === undefined ? {} : { auth }),
    actors: {
      resolve: resolveActor ?? (async () => actor),
      ...(sessionId === undefined ? {} : { sessionId: async () => sessionId }),
    },
    ...(sensitiveLimiter === undefined ? {} : { sensitiveLimiter }),
    ...(defer === undefined ? {} : { defer }),
    adminAssets: { fetch: async () => new Response("admin-shell") },
    config,
    content,
    links: new ContentLinkUseCases(
      linkReads ?? {
        listLinkTargets: async () => ({ items: [] }),
        resolveLinkTargets: async (ids) =>
          Object.fromEntries(ids.map((id) => [id, { id, state: "missing" }])),
        readLinkImpact: async () => ({
          mode: "sources",
          sources: [],
          receipt: "receipt",
          hasPublishedUsages: false,
        }),
      },
    ),
    ...(buildSite === undefined ? {} : { buildSite }),
    ...(builds === undefined ? {} : { builds }),
    ...(securityPort === undefined
      ? {}
      : {
          // The account routes run on host time here, as the runtimes' system clocks do.
          accounts: new AccountUseCases({
            clock: { now: () => unixMilliseconds(Date.now()) },
            email: email ?? unconfiguredEmailSender,
            ...(sensitiveLimiter === undefined ? {} : { limiter: sensitiveLimiter }),
            publicBaseUrl,
            security: securityPort,
          }),
          security: securityPort,
        }),
    ...(importActors === undefined ? {} : { importActors }),
    mcpEnabled: mcpEnabled ?? oauthConnections !== undefined,
    ...(mcp === undefined ? {} : { mcp }),
    ...(oauthConnections === undefined ? {} : { oauthConnections }),
    ...(email === undefined ? {} : { email }),
    environment: { engineVersion: "0.0.0-test", openApiTitle: "Lace test" },
    logger: { log: (entry) => logs.push(entry) },
    maxBodyBytes,
    media,
    publicBaseUrl,
    publicContent: {
      exportBuildContentPage: async (input) => {
        exportLoads += 1;
        return store.exportBuildContentPage(input);
      },
      listPublic: store.listPublic.bind(store),
      loadPublic: store.loadPublic.bind(store),
      loadPublicGlobal: store.loadPublicGlobal.bind(store),
      loadPublicMedia: store.loadPublicMedia.bind(store),
      publishedContentVersion: store.publishedContentVersion.bind(store),
    },
    rateLimiter: rateLimiter ?? { check: async () => allowed },
    readiness: { isReady: async () => ready },
    requestIds: { next: () => `request-${logs.length + 1}` },
  });
  return { app, content, exportLoads: () => exportLoads, logs, media, storage, store };
}

export async function json(app: App, path: string, init?: RequestInit) {
  const response = await app.fetch(new Request(`https://lace.test${path}`, init));
  return {
    body: response.status === 204 || response.status === 304 ? undefined : await response.json(),
    response,
  };
}

export const profiles: Record<string, { disabled: boolean; email: string; name?: string }> = {
  admin: { disabled: false, email: "admin@lace.test", name: "Ada Admin" },
  disabled: { disabled: true, email: "gone@lace.test" },
  editor: { disabled: false, email: "editor@lace.test" },
  viewer: { disabled: false, email: "viewer@lace.test", name: "Vi" },
};

export const profileSecurity = { readUserProfile: async (id: string) => profiles[id] ?? null };

export const mediaBlocks = [
  defineBlock({ fields: { image: field.media() }, type: "picture", version: 1 }),
  defineBlock({
    fields: {
      images: field.list({
        item: field.group({ fields: { caption: field.text(), image: field.media() } }),
      }),
    },
    type: "gallery",
    version: 1,
  }),
];

export const mediaModels = [
  defineCollection({
    blocks: ["picture", "gallery"],
    fields: { cover: field.media(), photos: field.list({ item: field.media() }) },
    key: "posts",
    route: "/blog/:slug",
    seo: {},
    version: 1,
  }),
];

export const PICTURE_KEY = "01ARZ3NDEKTSV4RRFFQ69G5FA1";

export const GALLERY_KEY = "01ARZ3NDEKTSV4RRFFQ69G5FA2";

export async function uploadImage(app: App, filename: string) {
  const form = new FormData();
  form.append(
    "file",
    new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])]),
    filename,
  );
  const created = await app.fetch(
    new Request("https://lace.test/api/v1/admin/media", { body: form, method: "POST" }),
  );
  expect(created.status).toBe(201);
  return created.json();
}

export function jsonRequest(method: string, body: unknown): RequestInit {
  return { body: JSON.stringify(body), headers: { "content-type": "application/json" }, method };
}

export const TOKEN = "Q".repeat(43);

export function accountSecurity(overrides: Partial<SecurityService> = {}) {
  const calls: unknown[][] = [];
  // Argument and result types come from the port member the call is assigned to.
  const record =
    <Args extends unknown[], Result>(name: string, result: NoInfer<Result>) =>
    async (...args: Args): Promise<Result> => {
      calls.push([name, ...args]);
      return result;
    };
  return {
    calls,
    security: fakePort<SecurityService>("SecurityService", {
      readUserProfile: async (id: string) => ({
        disabled: false,
        email: `${id}@lace.test`,
        name: id,
      }),
      acceptInvitation: record("acceptInvitation", { status: "invalid" }),
      changePassword: record("changePassword", { revoked: 1, status: "changed" }),
      confirmPasswordReset: record("confirmPasswordReset", { status: "invalid" }),
      createInvitation: record("createInvitation", {
        invitation: {
          createdAt: unixMilliseconds(1_000),
          email: "new@lace.test",
          expiresAt: unixMilliseconds(1_000 + 72 * 3_600_000),
          id: "inv-1",
          invitedBy: "admin",
          invitedByName: "Admin",
          role: "editor",
        },
        status: "created",
        token: opaqueTokenSecret(TOKEN),
      }),
      deleteOtherSessions: record("deleteOtherSessions", 2),
      deleteSession: record("deleteSession", false),
      deleteUserSessions: record("deleteUserSessions", 3),
      inspectInvitation: record("inspectInvitation", null),
      issuePasswordReset: record("issuePasswordReset", {
        email: "editor@lace.test",
        status: "issued",
        token: opaqueTokenSecret(TOKEN),
        userId: "editor",
      }),
      listInvitations: record("listInvitations", []),
      listSessions: record("listSessions", [
        { createdAt: unixMilliseconds(1), id: "s-current", lastActiveAt: unixMilliseconds(2) },
        {
          createdAt: unixMilliseconds(1),
          id: "s-other",
          lastActiveAt: unixMilliseconds(3),
          userAgent: "Mozilla/5.0 (Windows NT 10.0) Chrome/129.0 Safari/537.36",
        },
      ]),
      reissueInvitation: record("reissueInvitation", { status: "not_found" }),
      revokeInvitation: record("revokeInvitation", "revoked"),
      updateDisplayName: record("updateDisplayName", true),
      ...overrides,
    }),
  };
}

export function send(app: App, path: string, method = "POST", body?: unknown) {
  return app.fetch(
    new Request(`https://lace.test${path}`, {
      method,
      ...(body === undefined
        ? {}
        : { body: JSON.stringify(body), headers: { "content-type": "application/json" } }),
    }),
  );
}

export const importToken = (
  capabilities: ImportTokenCapabilities = ["content:import"],
): ImportTokenMetadata => ({
  capabilities,
  createdAt: unixMilliseconds(1),
  createdBy: { email: "admin@lace.test", id: "admin" },
  expiresAt: unixMilliseconds(7 * 86_400_000),
  id: "import-1",
  name: "Framer",
  tokenPrefix: "abcdefgh",
});

/** Mirrors the auth package's import ceiling without depending on it. */

export function importResolution(capabilities: ImportTokenCapabilities, role: Role = "admin") {
  const publish = (capabilities as readonly string[]).includes("content:publish");
  return {
    actor: delegatedActor(testActor(role, "admin"), {
      permissions: [
        "content:read",
        "content:write",
        "media:write",
        ...(publish ? ["content:publish" as const] : []),
      ],
      operations: [
        "discoverModels",
        "list",
        "load",
        "create",
        "save",
        ...(publish ? ["publish" as const] : []),
      ],
    }),
    token: importToken(capabilities),
  };
}

export async function importFixture(
  capabilities: ImportTokenCapabilities = ["content:import"],
  options: FixtureOptions & { role?: Role } = {},
) {
  const sessions: string[] = [];
  const presented: (string | null)[] = [];
  const limited: string[] = [];
  const result = await fixture({
    maxBodyBytes: 8192,
    resolveActor: async (request) => {
      sessions.push(new URL(request.url).pathname);
      return admin;
    },
    importActors: {
      async resolve(request) {
        presented.push(request.headers.get("authorization"));
        return request.headers.get("authorization") === "Bearer good"
          ? importResolution(capabilities, options.role ?? "admin")
          : null;
      },
    },
    rateLimiter: {
      async check(input) {
        if (input.actor !== undefined) limited.push(input.actor.id);
        return true;
      },
    },
    ...options,
  });
  const call = (
    method: string,
    path: string,
    body?: unknown,
    headers: Record<string, string> = {},
  ) =>
    result.app.fetch(
      new Request(`https://lace.test${path}`, {
        method,
        headers: {
          authorization: "Bearer good",
          ...(body === undefined || body instanceof FormData
            ? {}
            : { "content-type": "application/json" }),
          ...headers,
        },
        ...(body === undefined
          ? {}
          : { body: body instanceof FormData ? body : JSON.stringify(body) }),
      }),
    );
  return { ...result, call, limited, presented, sessions };
}
