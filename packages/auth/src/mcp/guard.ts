import type { DBAdapter, Where } from "better-auth";
import { APIError } from "better-auth/api";
import type {
  OAuthGrant,
  OAuthIssuance,
  OAuthIssuancePersistence,
  OAuthPreparedToken,
} from "@lacecms/application";

function invalidGrant(): APIError {
  return new APIError("BAD_REQUEST", {
    error: "invalid_grant",
    error_description: "Invalid or revoked authorization grant.",
  });
}
function text(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) throw invalidGrant();
  return value;
}
function date(value: unknown): number {
  if (!(value instanceof Date) || !Number.isSafeInteger(value.getTime())) throw invalidGrant();
  return value.getTime();
}
function strings(value: unknown): string[] {
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string"))
    throw invalidGrant();
  return value as string[];
}
function whereValue(where: readonly Where[] | undefined, field: string): unknown {
  return where?.find(
    (item) => item.field === field && (item.operator === undefined || item.operator === "eq"),
  )?.value;
}

/** Provider-compatible digest of high-entropy opaque credentials, never passwords. */
export async function oauthCredentialHash(value: string): Promise<string> {
  const bytes = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
  );
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

export interface OAuthRequestGuardInput {
  readonly persistence: OAuthIssuancePersistence;
  readonly kind: "code" | "refresh";
  readonly inputHash: string;
  readonly clientId: string;
  readonly resource: string;
  readonly now?: () => number;
  readonly id?: () => string;
}

/** One token request only. Uses the provider's public DBAdapter contract. */
export function createOAuthRequestGuard(input: OAuthRequestGuardInput): {
  readonly wrap: (adapter: DBAdapter) => DBAdapter;
  readonly finish: (response: Response) => Promise<Response>;
  readonly fail: () => Promise<void>;
} {
  const now = input.now ?? Date.now;
  const id = input.id ?? (() => crypto.randomUUID());
  const store = input.persistence;
  let attempt: OAuthIssuance | null = null;
  let grant: OAuthGrant | null = null;
  const prepared: { kind: "access" | "refresh"; id: string; hash: string }[] = [];
  const fail = async () => {
    if (attempt) await store.abort(attempt, now());
  };
  const wrap = (base: DBAdapter): DBAdapter => {
    const guarded: DBAdapter = {
      ...base,
      transaction: (callback) =>
        base.transaction((transaction) => callback(wrap({ ...base, ...transaction }))),
      findOne: async <T>(request: Parameters<DBAdapter["findOne"]>[0]): Promise<T | null> => {
        if (
          input.kind === "refresh" &&
          request.model === "oauthRefreshToken" &&
          whereValue(request.where, "token") === input.inputHash
        ) {
          const binding = await store.authority("refresh", input.inputHash, input.clientId, now());
          if (!binding || binding.grant.resource !== input.resource) return null;
          grant = binding.grant;
          const row = await base.findOne<Record<string, unknown>>(request);
          if (!row) {
            await store.revokeReplay(input.inputHash, input.clientId, now());
            return null;
          }
          if (row.id !== binding.providerId) throw invalidGrant();
          return row as T;
        }
        return base.findOne<T>(request);
      },
      consumeOne: async <T>(request: Parameters<DBAdapter["consumeOne"]>[0]): Promise<T | null> => {
        if (request.model !== "verification") return base.consumeOne<T>(request);
        if (input.kind !== "code") throw invalidGrant();
        const row = await base.findOne<Record<string, unknown>>(request);
        if (!row || row.identifier !== input.inputHash) return null;
        let value: Record<string, unknown>;
        try {
          value = JSON.parse(text(row.value)) as Record<string, unknown>;
        } catch {
          throw invalidGrant();
        }
        grant = await store.grant(text(value.referenceId), now());
        if (
          !grant ||
          grant.clientId !== input.clientId ||
          grant.resource !== input.resource ||
          value.userId !== grant.userId
        )
          throw invalidGrant();
        attempt = await store.claim({
          id: id(),
          kind: "code",
          grantId: grant.id,
          providerId: text(row.id),
          inputHash: input.inputHash,
          clientId: input.clientId,
          now: now(),
        });
        return attempt ? (row as T) : null;
      },
      incrementOne: async <T>(
        request: Parameters<DBAdapter["incrementOne"]>[0],
      ): Promise<T | null> => {
        if (request.model !== "oauthRefreshToken") return base.incrementOne<T>(request);
        if (
          input.kind !== "refresh" ||
          !grant ||
          Object.keys(request.increment).length !== 0 ||
          whereValue(request.where, "revoked") !== null
        )
          throw invalidGrant();
        const providerId = text(whereValue(request.where, "id"));
        attempt = await store.claim({
          id: id(),
          kind: "refresh",
          grantId: grant.id,
          providerId,
          inputHash: input.inputHash,
          clientId: input.clientId,
          now: now(),
        });
        if (!attempt) return null;
        return base.findOne<T>({
          model: "oauthRefreshToken",
          where: [{ field: "id", value: providerId }],
        });
      },
      create: async <T extends Record<string, unknown>, R = T>(request: {
        model: string;
        data: Omit<T, "id">;
        select?: string[] | undefined;
        forceAllowId?: boolean | undefined;
      }): Promise<R> => {
        if (request.model !== "oauthRefreshToken" && request.model !== "oauthAccessToken")
          return base.create<T, R>(request);
        if (!attempt || !grant) throw invalidGrant();
        const data = request.data;
        // The selected opaque, non-OIDC profile has no sender-constraint claims.
        // Reject unexpected provider extensions rather than silently drop them.
        if (
          data.confirmation !== undefined ||
          (Array.isArray(data.requestedUserInfoClaims) && data.requestedUserInfoClaims.length > 0)
        )
          throw invalidGrant();
        const token: OAuthPreparedToken = {
          id: id(),
          kind: request.model === "oauthAccessToken" ? "access" : "refresh",
          hash: text(data.token),
          clientId: text(data.clientId),
          userId: text(data.userId),
          sessionId: typeof data.sessionId === "string" ? data.sessionId : null,
          authorizationCodeId:
            typeof data.authorizationCodeId === "string" ? data.authorizationCodeId : null,
          refreshId: typeof data.refreshId === "string" ? data.refreshId : null,
          resources: strings(data.resources),
          scopes: strings(data.scopes),
          createdAt: date(data.createdAt),
          expiresAt: Math.min(date(data.expiresAt), grant.expiresAt),
          authTime: data.authTime instanceof Date ? date(data.authTime) : null,
        };
        if (data.referenceId !== grant.id || !(await store.prepare(attempt, token, now())))
          throw invalidGrant();
        prepared.push({ kind: token.kind, id: token.id, hash: token.hash });
        return { ...data, id: token.id, expiresAt: new Date(token.expiresAt) } as unknown as R;
      },
      deleteMany: async (request) => {
        if (
          grant &&
          (request.model === "oauthRefreshToken" || request.model === "oauthAccessToken")
        ) {
          await store.revokeFamily(grant.id, now());
          // Provider replay cleanup is keyed by user/client. Independent Lace
          // connections have distinct reference IDs and must retain credentials.
          return base.deleteMany({
            ...request,
            where: [...(request.where ?? []), { field: "referenceId", value: grant.id }],
          });
        }
        return base.deleteMany(request);
      },
    };
    // The provider must never receive raw SQL/driver errors that its default
    // error logger could print. Public adapter methods remain the only seam.
    return new Proxy(guarded, {
      get(target, property, receiver) {
        const value: unknown = Reflect.get(target, property, receiver);
        if (typeof value !== "function") return value;
        return async (...args: unknown[]) => {
          try {
            return await Reflect.apply(value, target, args);
          } catch (error) {
            if (error instanceof APIError) throw error;
            throw new APIError("INTERNAL_SERVER_ERROR", {
              error: "server_error",
              error_description: "Authorization is temporarily unavailable.",
            });
          }
        };
      },
    });
  };
  return Object.freeze({
    wrap,
    fail,
    finish: async (response: Response) => {
      if (!attempt)
        return response.ok
          ? Response.json(
              { error: "invalid_grant", error_description: "Invalid authorization grant." },
              { status: 400, headers: { "cache-control": "no-store" } },
            )
          : response;
      if (!response.ok) {
        await fail();
        return response;
      }
      try {
        const body = (await response.clone().json()) as Record<string, unknown>;
        const accessHash = await oauthCredentialHash(text(body.access_token));
        const refreshHash =
          typeof body.refresh_token === "string"
            ? await oauthCredentialHash(body.refresh_token)
            : null;
        if (
          prepared.find((token) => token.kind === "access")?.hash !== accessHash ||
          (refreshHash !== null &&
            prepared.find((token) => token.kind === "refresh")?.hash !== refreshHash) ||
          (refreshHash === null && prepared.some((token) => token.kind === "refresh")) ||
          !(await store.commit(attempt, prepared, now()))
        )
          throw invalidGrant();
        if (!grant) throw invalidGrant();
        const expiry = Math.min(Number(body.expires_at), Math.floor(grant.expiresAt / 1000));
        const headers = new Headers(response.headers);
        headers.set("cache-control", "no-store");
        headers.delete("content-length");
        return Response.json(
          {
            ...body,
            expires_at: expiry,
            expires_in: Math.max(0, expiry - Math.floor(now() / 1000)),
          },
          { status: response.status, headers },
        );
      } catch {
        await fail();
        return Response.json(
          { error: "invalid_grant", error_description: "Invalid or revoked authorization grant." },
          { status: 400, headers: { "cache-control": "no-store" } },
        );
      }
    },
  });
}
