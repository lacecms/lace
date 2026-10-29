import { APIError } from "better-auth/api";
import { actorId, hasPermission, type Role } from "@lacecms/domain";
import type { OAuthIssuancePersistence } from "@lacecms/application";
import { normalizeMcpScopes, mcpOAuthUrls, type McpOAuthProviderInput } from "./mcp-oauth.js";
import { oauthCredentialHash } from "./oauth-guard.js";
import type { McpProviderFactory, McpProvider } from "./mcp-boundary.js";

export interface OAuthBrowserSession {
  readonly userId: string;
  readonly sessionId: string;
  readonly role: Role;
  readonly createdAt: number;
}
interface Transaction {
  readonly referenceId: string;
  readonly query: string;
  readonly signedQuery: string;
  readonly createdAt: number;
  readonly expiresAt: number;
  readonly userId: string | null;
  readonly sessionId: string | null;
  readonly generation: number | null;
}
const handlePattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const denied = (): never => {
  throw new APIError("BAD_REQUEST", { error: "invalid_request" });
};
const failure = (error = "invalid_request", status = 400) =>
  Response.json(
    { error },
    {
      status,
      headers: { "cache-control": "no-store" },
    },
  );
const navigation = (request: Request, target: string, headers?: Headers): Response => {
  const resultHeaders = new Headers(headers);
  resultHeaders.set("cache-control", "no-store");
  resultHeaders.delete("content-length");
  if (request.headers.get("accept")?.includes("application/json"))
    return Response.json({ redirect: true, url: target }, { headers: resultHeaders });
  resultHeaders.set("location", target);
  return new Response(null, { status: 302, headers: resultHeaders });
};

/** Server-bound continuation records use the provider's indexed verification store. */
export function createMcpConsentBoundary(input: {
  readonly origin: URL;
  readonly production: boolean;
  readonly provider: McpProviderFactory;
  readonly persistence: OAuthIssuancePersistence;
  readonly session: (request: Request) => Promise<OAuthBrowserSession | null>;
}): { fetch(request: Request, rawBody?: string): Promise<Response> } {
  const { resource, issuer } = mcpOAuthUrls(input.origin, input.production);
  const identifier = async (handle: string) => `lace-mcp:${await oauthCredentialHash(handle)}`;
  const load = async (
    provider: McpProvider,
    handle: string,
    consume = false,
  ): Promise<Transaction> => {
    if (!handlePattern.test(handle)) return denied();
    const query = {
      model: "verification",
      where: [{ field: "identifier", value: await identifier(handle) }],
    };
    const row = consume
      ? await provider.adapter.consumeOne<Record<string, unknown>>(query)
      : await provider.adapter.findOne<Record<string, unknown>>(query);
    if (
      !row ||
      !(row.expiresAt instanceof Date) ||
      row.expiresAt.getTime() <= Date.now() ||
      typeof row.value !== "string"
    )
      return denied();
    const value = JSON.parse(row.value) as Transaction;
    if (
      !value ||
      typeof value.query !== "string" ||
      typeof value.signedQuery !== "string" ||
      !handlePattern.test(value.referenceId) ||
      !Number.isSafeInteger(value.createdAt) ||
      !Number.isSafeInteger(value.expiresAt) ||
      value.expiresAt <= Date.now()
    )
      return denied();
    return value;
  };
  const verifySession = async (request: Request, tx: Transaction): Promise<OAuthBrowserSession> => {
    const session = await input.session(request);
    if (
      !session ||
      (tx.userId !== null &&
        (session.userId !== tx.userId || session.sessionId !== tx.sessionId)) ||
      (tx.userId === null && session.createdAt < tx.createdAt - 1000)
    )
      return denied();
    const generation = await input.persistence.userGeneration(session.userId);
    if (generation === null || (tx.generation !== null && generation !== tx.generation))
      return denied();
    return session;
  };
  const reference =
    (tx: Transaction, approved = false): McpOAuthProviderInput["consentReferenceId"] =>
    async ({ user, session, scopes }) => {
      if (
        !user ||
        !session ||
        user.id !== tx.userId ||
        session.id !== tx.sessionId ||
        (await input.persistence.userGeneration(user.id)) !== tx.generation
      )
        return denied();
      const role = user.role;
      if (role !== "admin" && role !== "editor" && role !== "viewer") return denied();
      const allowed = new URLSearchParams(tx.query).get("scope")!.split(" ");
      if (scopes.some((scope) => !allowed.includes(scope))) return denied();
      if (
        approved &&
        scopes.includes("content:write") &&
        !hasPermission({ id: actorId(user.id), role }, "content:write")
      )
        throw new APIError("FORBIDDEN", { error: "access_denied" });
      return tx.referenceId;
    };
  const bind = async (tx: Transaction, session: OAuthBrowserSession): Promise<Transaction> => {
    const generation = await input.persistence.userGeneration(session.userId);
    if (generation === null || (tx.generation !== null && generation !== tx.generation))
      return denied();
    return { ...tx, userId: session.userId, sessionId: session.sessionId, generation };
  };
  const storeNavigation = async (
    request: Request,
    response: Response,
    tx: Transaction,
    provider: McpProvider,
  ): Promise<Response> => {
    if (!response.ok) return failure("access_denied", response.status);
    const body = (await response.json()) as { redirect?: boolean; url?: string };
    if (!body.redirect || typeof body.url !== "string") return denied();
    const target = new URL(body.url, input.origin);
    if (
      target.origin !== input.origin.origin ||
      !["/admin/sign-in", "/admin/mcp/consent"].includes(target.pathname)
    )
      return failure("invalid_request");
    if (!target.searchParams.has("sig")) return denied();
    const handle = crypto.randomUUID();
    const now = new Date();
    await provider.adapter.create({
      model: "verification",
      data: {
        identifier: await identifier(handle),
        value: JSON.stringify({ ...tx, signedQuery: target.searchParams.toString() }),
        expiresAt: new Date(tx.expiresAt),
        createdAt: now,
        updatedAt: now,
      },
    });
    const destination = new URL(target.pathname, input.origin);
    destination.searchParams.set("mcpTransaction", handle);
    return navigation(request, destination.href, response.headers);
  };
  const authorize = async (request: Request, tx: Transaction): Promise<Response> => {
    const provider = await input.provider(
      undefined,
      tx.userId === null ? undefined : reference(tx),
    );
    const headers = new Headers(request.headers);
    headers.set("accept", "application/json");
    return storeNavigation(
      request,
      await provider.fetch(new Request(`${issuer}/oauth2/authorize?${tx.query}`, { headers })),
      tx,
      provider,
    );
  };
  return {
    fetch: async (request, rawBody) => {
      let createdGrant: string | null = null;
      try {
        const url = new URL(request.url);
        if (new TextEncoder().encode(url.search).byteLength > 8192) return denied();
        const provider = await input.provider();
        if (url.pathname.endsWith("/authorize")) {
          const handle = url.searchParams.get("transaction");
          if (handle !== null) {
            const tx = await load(provider, handle);
            const session = await verifySession(request, tx);
            if (tx.userId === null) {
              await load(provider, handle, true);
              return await authorize(request, await bind(tx, session));
            }
            const clientId = new URLSearchParams(tx.query).get("client_id")!;
            const client = await provider.adapter.findOne<Record<string, unknown>>({
              model: "oauthClient",
              where: [{ field: "clientId", value: clientId }],
            });
            if (!client || client.disabled === true) return denied();
            return Response.json(
              {
                transaction: handle,
                clientName: typeof client.name === "string" ? client.name : "MCP client",
                callbackHostname: new URL(new URLSearchParams(tx.query).get("redirect_uri")!)
                  .hostname,
                scopes: new URLSearchParams(tx.query).get("scope")!.split(" "),
                canWrite: hasPermission(
                  { id: actorId(session.userId), role: session.role },
                  "content:write",
                ),
              },
              { headers: { "cache-control": "no-store" } },
            );
          }
          const params =
            request.method === "POST"
              ? new URLSearchParams(rawBody)
              : new URLSearchParams(url.search);
          if ([...new Set(params.keys())].some((key) => params.getAll(key).length !== 1))
            return denied();
          if (params.get("resource") !== null && params.get("resource") !== resource)
            return failure("invalid_target");
          params.set("resource", resource);
          params.set("scope", normalizeMcpScopes(params.get("scope") ?? "content:read").join(" "));
          // No alternate continuation or request-object inputs enter the provider.
          const allowed = [
            "client_id",
            "redirect_uri",
            "response_type",
            "scope",
            "resource",
            "state",
            "code_challenge",
            "code_challenge_method",
            "prompt",
          ];
          if ([...params.keys()].some((key) => !allowed.includes(key))) return denied();
          const now = Date.now();
          let tx: Transaction = {
            referenceId: crypto.randomUUID(),
            query: params.toString(),
            signedQuery: "",
            createdAt: now,
            expiresAt: now + 300000,
            userId: null,
            sessionId: null,
            generation: null,
          };
          const session = await input.session(request);
          if (session) tx = await bind(tx, session);
          return await authorize(request, tx);
        }
        if (request.method !== "POST" || request.headers.get("origin") !== input.origin.origin)
          return failure("access_denied", 403);
        const body = JSON.parse(rawBody ?? "") as Record<string, unknown>;
        if (
          !body ||
          typeof body.transaction !== "string" ||
          Object.keys(body).some((key) => !["transaction", "accept", "scope"].includes(key))
        )
          return denied();
        const tx = await load(provider, body.transaction);
        const session = await verifySession(request, tx);
        if (tx.userId === null) return denied();
        if (url.pathname.endsWith("/continue"))
          return navigation(
            request,
            `${input.origin.origin}/admin/mcp/consent?mcpTransaction=${encodeURIComponent(body.transaction)}`,
          );
        if (
          typeof body.accept !== "boolean" ||
          (body.scope !== undefined && typeof body.scope !== "string")
        )
          return denied();
        const requested = new URLSearchParams(tx.query).get("scope")!.split(" ");
        const scopes = typeof body.scope === "string" ? normalizeMcpScopes(body.scope) : requested;
        if (scopes.some((scope) => !requested.includes(scope))) return failure("invalid_scope");
        if (
          body.accept &&
          scopes.includes("content:write") &&
          !hasPermission({ id: actorId(session.userId), role: session.role }, "content:write")
        )
          return failure("access_denied", 403);
        await load(provider, body.transaction, true);
        if (
          body.accept &&
          !(await input.persistence.createGrant({
            id: tx.referenceId,
            userId: session.userId,
            clientId: new URLSearchParams(tx.query).get("client_id")!,
            resource,
            scopes,
            userGeneration: tx.generation!,
            createdAt: Date.now(),
            expiresAt: Date.now() + 2592000000,
          }))
        )
          return denied();
        if (body.accept) createdGrant = tx.referenceId;
        const scopedProvider = await input.provider(undefined, reference(tx, true));
        const headers = new Headers(request.headers);
        headers.set("accept", "application/json");
        headers.set("content-type", "application/json");
        headers.delete("content-length");
        const response = await scopedProvider.fetch(
          new Request(`${issuer}/oauth2/consent`, {
            method: "POST",
            headers,
            body: JSON.stringify({
              accept: body.accept,
              scope: scopes.join(" "),
              oauth_query: tx.signedQuery,
            }),
          }),
        );
        if (!response.ok) {
          if (body.accept) await input.persistence.revokeFamily(tx.referenceId, Date.now());
          return failure("access_denied", response.status);
        }
        const result = (await response.json()) as { redirect?: boolean; url?: string };
        if (!result.redirect || typeof result.url !== "string") return denied();
        const target = new URL(result.url);
        const expected = new URL(new URLSearchParams(tx.query).get("redirect_uri")!);
        if (
          target.origin !== expected.origin ||
          target.pathname !== expected.pathname ||
          (body.accept
            ? !target.searchParams.has("code")
            : target.searchParams.get("error") !== "access_denied")
        ) {
          if (body.accept) await input.persistence.revokeFamily(tx.referenceId, Date.now());
          return denied();
        }
        return navigation(request, target.href, response.headers);
      } catch {
        if (createdGrant) {
          try {
            await input.persistence.revokeFamily(createdGrant, Date.now());
          } catch {
            /* No credentials are returned after a persistence failure. */
          }
        }
        return failure();
      }
    },
  };
}
