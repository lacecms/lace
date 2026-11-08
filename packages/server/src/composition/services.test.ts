import type { SecurityService, SensitiveRateLimiter } from "@lacecms/application";
import { NODE_LIST_QUERY_LIMITS } from "@lacecms/content";
import { defineCollection, defineConfig } from "@lacecms/config";
import { unixMilliseconds } from "@lacecms/domain";
import {
  DeterministicClock,
  DeterministicIdGenerator,
  InMemoryObjectStorage,
  admin,
  fakePort,
} from "@lacecms/test-utils";
import { expect, test } from "vitest";
import {
  SensitiveRequestRateLimiter,
  composeLaceServices,
  jsonRequestLogger,
  type LaceRepository,
  type LaceServicesInput,
} from "../index.js";

const allow: SensitiveRateLimiter = {
  check: async () => ({ allowed: true, retryAfterSeconds: 0 }),
};

async function input(overrides: {
  readonly security?: Partial<SecurityService>;
  readonly mcpEnabled?: boolean;
  readonly boundaryMcp?: boolean;
  readonly mcp?: LaceServicesInput["mcp"];
  readonly limits?: Partial<LaceServicesInput["limits"]>;
  readonly logs?: Record<string, string>[];
}): Promise<LaceServicesInput> {
  const config = await defineConfig({
    content: [defineCollection({ key: "posts", route: "/blog/:slug", version: 1 })],
  });
  return {
    auth: {
      boundary: {
        actors: { resolve: async () => null },
        fetch: async () => new Response(null, { status: 404 }),
        ...(overrides.boundaryMcp
          ? { mcp: { resolve: async () => ({ response: new Response(null, { status: 401 }) }) } }
          : {}),
      },
      importActors: { resolve: async () => null },
    },
    clock: new DeterministicClock(unixMilliseconds(1_234)),
    config,
    email: { provider: "none", send: async () => ({ status: "sent" }) } as never,
    http: {
      buildSite: null,
      environment: { engineVersion: "0.0.0-test", openApiTitle: "Lace test" },
      flags: { apiDocsEnabled: true, mcpEnabled: overrides.mcpEnabled ?? false },
      maxBodyBytes: 1_024,
      publicBaseUrl: new URL("https://lace.test/"),
      readiness: { isReady: async () => true },
      requestIds: { next: () => "request" },
    },
    ids: new DeterministicIdGenerator("services"),
    imageInspector: { inspect: async () => ({ height: 1, width: 1 }) },
    limits: { clientAddress: () => "203.0.113.7", sensitive: allow, ...overrides.limits },
    listQueryLimits: NODE_LIST_QUERY_LIMITS,
    logger: { error: (entry) => overrides.logs?.push({ ...entry }) },
    ...(overrides.mcp === undefined ? {} : { mcp: overrides.mcp }),
    repository: fakePort<LaceRepository>("repository", {}),
    security: fakePort<SecurityService>("SecurityService", overrides.security ?? {}),
    storage: new InMemoryObjectStorage(),
  };
}

test("composes each use case once and hands the same instances to the app input", async () => {
  const services = composeLaceServices(await input({}));
  const { appInput } = services;
  expect(appInput.content).toBe(services.content);
  expect(appInput.media).toBe(services.media);
  expect(appInput.links).toBe(services.links);
  expect(appInput.builds).toBe(services.builds);
  expect(appInput.accounts).toBe(services.accounts);
  expect(appInput.publicBaseUrl).toBe("https://lace.test/");
  expect(appInput.apiDocsEnabled).toBe(true);
  expect(appInput.mcpEnabled).toBe(false);
  expect(appInput.logger).toBe(jsonRequestLogger);
  expect(appInput.rateLimiter).toBeInstanceOf(SensitiveRequestRateLimiter);
  expect(appInput.sensitiveLimiter).toBe(allow);
  expect(appInput).not.toHaveProperty("mcp");
  expect(services).not.toHaveProperty("oauthConnections");
});

test("composes MCP and OAuth connections only when enabled and supplied", async () => {
  const handled: unknown[] = [];
  const mcp: LaceServicesInput["mcp"] = {
    connections: fakePort("OAuthConnectionPort", {}),
    createHandler: (content) => {
      handled.push(content);
      return { fetch: async () => new Response(null) };
    },
  };
  const disabled = composeLaceServices(await input({ boundaryMcp: true, mcp }));
  expect(disabled.appInput).not.toHaveProperty("mcp");
  expect(disabled.appInput).not.toHaveProperty("oauthConnections");
  expect(handled).toEqual([]);

  const enabled = composeLaceServices(await input({ boundaryMcp: true, mcp, mcpEnabled: true }));
  expect(enabled.appInput.mcp).toBeDefined();
  expect(enabled.appInput.oauthConnections).toBe(enabled.oauthConnections);
  expect(handled).toEqual([enabled.content]);

  // Without an OAuth boundary the protocol endpoint stays unavailable.
  const unbound = composeLaceServices(await input({ mcp, mcpEnabled: true }));
  expect(unbound.appInput).not.toHaveProperty("mcp");
  expect(unbound.oauthConnections).toBeDefined();
});

test("a request-limiter override replaces the sensitive limiter in the app input", async () => {
  const requests = { check: async () => true };
  const { appInput } = composeLaceServices(await input({ limits: { requests } }));
  expect(appInput.rateLimiter).toBe(requests);
  expect(appInput).not.toHaveProperty("sensitiveLimiter");
});

test("account flows run on the composed clock", async () => {
  const seen: number[] = [];
  const services = composeLaceServices(
    await input({
      security: {
        createInvitation: async ({ now }) => {
          seen.push(now);
          return { status: "conflict" };
        },
      },
    }),
  );
  await expect(
    services.accounts.invite(admin, { email: "new@example.com", role: "editor" }),
  ).rejects.toMatchObject({ code: "CONFLICT" });
  expect(seen).toEqual([1_234]);
});

test("a failed deferred task is logged without request data", async () => {
  const logs: Record<string, string>[] = [];
  const { appInput } = composeLaceServices(await input({ logs }));
  appInput.defer!(Promise.reject(new Error("secret detail")));
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(logs).toEqual([{ component: "deferred", reason: "task_failed" }]);
});
