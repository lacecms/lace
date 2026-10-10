export * from "./client-address.js";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { actorId, type Actor, type Role } from "@lacecms/domain";

export const packageName = "@lacecms/auth";

export interface AuthRouteHandler {
  fetch(request: Request): Promise<Response>;
}

export interface SessionActorResolver {
  resolve(request: Request): Promise<Actor | null>;
  /** The opaque identifier of the session authenticating the request; never its token. */
  sessionId(request: Request): Promise<string | null>;
}

/**
 * The only provider routes Lace exposes. Every other `/api/auth/*` path returns
 * `404` before the provider runs, so provider upgrades cannot add credential or
 * session routes that bypass Lace rules.
 */
export const PROVIDER_ROUTE_ALLOWLIST: readonly (readonly [method: string, path: string])[] =
  Object.freeze([
    Object.freeze(["POST", "/api/auth/sign-in/email"] as const),
    Object.freeze(["POST", "/api/auth/sign-out"] as const),
    Object.freeze(["GET", "/api/auth/get-session"] as const),
  ]);

function allowedProviderRoute(request: Request): boolean {
  const { pathname } = new URL(request.url);
  const method = request.method === "HEAD" ? "GET" : request.method;
  return PROVIDER_ROUTE_ALLOWLIST.some(
    ([allowedMethod, path]) => allowedMethod === method && path === pathname,
  );
}

export interface BetterAuthBoundary extends AuthRouteHandler {
  readonly actors: SessionActorResolver;
}

export interface CreateBetterAuthBoundaryInput {
  readonly clientAddress?: (request: Request) => string;
  readonly database: object;
  readonly origin: URL;
  readonly production: boolean;
  readonly schema: Record<string, unknown>;
  readonly secret: string;
}

function laceRole(value: unknown): Role | undefined {
  return value === "admin" || value === "editor" || value === "viewer" ? value : undefined;
}

function trustedOrigins(origin: URL, production: boolean): string[] {
  const canonical = origin.origin;
  if (production || (origin.hostname !== "localhost" && origin.hostname !== "127.0.0.1")) {
    return [canonical];
  }
  const alternate = new URL(canonical);
  alternate.hostname = origin.hostname === "localhost" ? "127.0.0.1" : "localhost";
  return [canonical, alternate.origin];
}

/** Creates the Node Better Auth boundary without leaking provider types to HTTP routes. */
export function createBetterAuthBoundary(input: CreateBetterAuthBoundaryInput): BetterAuthBoundary {
  const origin = input.origin.origin;
  const allowedOrigins = trustedOrigins(input.origin, input.production);
  const auth = betterAuth({
    advanced: {
      ipAddress: { ipAddressHeaders: ["x-lace-client-address"], ipv6Subnet: 128 },
      defaultCookieAttributes: {
        httpOnly: true,
        sameSite: "lax",
        secure: input.production,
      },
      disableCSRFCheck: false,
      disableOriginCheck: false,
    },
    basePath: "/api/auth",
    baseURL: new URL("/api/auth", origin).href,
    database: drizzleAdapter(input.database, {
      provider: "sqlite",
      schema: input.schema,
    }),
    emailAndPassword: {
      disableSignUp: true,
      enabled: true,
    },
    // Provider messages can contain caller origins or raw upstream errors.
    // Keep a closed diagnostic while the HTTP boundary records request/status.
    logger: {
      log: (level) => {
        if (level === "warn" || level === "error")
          console.error(
            JSON.stringify({ component: "auth", level, reason: "provider_operation_failed" }),
          );
      },
    },
    rateLimit: { enabled: input.production },
    secret: input.secret,
    trustedOrigins: allowedOrigins,
    user: {
      additionalFields: {
        disabled: {
          defaultValue: false,
          input: false,
          required: false,
          type: "boolean",
        },
        role: {
          defaultValue: "viewer",
          input: false,
          required: false,
          type: "string",
        },
      },
    },
  });

  type ProviderSession = Awaited<ReturnType<typeof auth.api.getSession>>;
  // One provider lookup per request serves both the actor and the session id.
  const sessions = new WeakMap<Request, Promise<ProviderSession>>();
  function providerSession(request: Request): Promise<ProviderSession> {
    let pending = sessions.get(request);
    if (pending === undefined) {
      pending = auth.api.getSession({ headers: request.headers });
      sessions.set(request, pending);
    }
    return pending;
  }

  function trustedRequestOrigin(request: Request): boolean {
    if (["GET", "HEAD", "OPTIONS"].includes(request.method)) return true;
    const requestOrigin = request.headers.get("origin");
    if (requestOrigin !== null) return allowedOrigins.includes(requestOrigin);
    return request.headers.get("sec-fetch-site") !== "cross-site";
  }

  async function activeSession(request: Request) {
    if (!trustedRequestOrigin(request)) return null;
    const session = await providerSession(request);
    const role = laceRole(session?.user.role);
    return session === null ||
      session === undefined ||
      role === undefined ||
      session.user.disabled === true
      ? null
      : { role, session };
  }

  return Object.freeze({
    actors: Object.freeze({
      resolve: async (request: Request) => {
        const active = await activeSession(request);
        return active === null
          ? null
          : Object.freeze({ id: actorId(active.session.user.id), role: active.role });
      },
      sessionId: async (request: Request) => {
        const active = await activeSession(request);
        return active === null ? null : active.session.session.id;
      },
    }),
    fetch: async (request: Request) => {
      if (!allowedProviderRoute(request)) return new Response(null, { status: 404 });
      const headers = new Headers(request.headers);
      headers.set("x-lace-client-address", input.clientAddress?.(request) ?? "0.0.0.0");
      // The Node transport may supply a Request-compatible facade; clone materializes
      // its native Request before the platform constructor performs brand checks.
      return auth.handler(new Request(request.clone(), { headers }));
    },
  });
}
