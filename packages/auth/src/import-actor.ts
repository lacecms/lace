import {
  opaqueTokenSecret,
  type ImportTokenMetadata,
  type SecurityService,
} from "@lacecms/application";
import { actorId, attenuateActor, type Actor, type Permission, type Role } from "@lacecms/domain";
import { trustedOrigins } from "./trusted-origins.js";

export interface ImportActorResolution {
  readonly actor: Actor;
  readonly token: ImportTokenMetadata;
}

/** The delegated ceiling of an import token; publication only with `content:publish`. */
export function importTokenAuthority(token: Pick<ImportTokenMetadata, "capabilities">): {
  readonly permissions: readonly Permission[];
  readonly operations: readonly string[];
} {
  const publish = (token.capabilities as readonly string[]).includes("content:publish");
  return {
    permissions: [
      "content:read",
      "content:write",
      "media:write",
      ...(publish ? (["content:publish"] as const) : []),
    ],
    operations: [
      "discoverModels",
      "list",
      "load",
      "create",
      "save",
      ...(publish ? ["publish"] : []),
    ],
  };
}

function laceRole(value: string): Role | undefined {
  return value === "admin" || value === "editor" || value === "viewer" ? value : undefined;
}

/**
 * A bearer-only resolver for `lace import` (ADR 0016). It never reads cookies:
 * the caller routes every request that carries a Bearer credential here, so a
 * failure is final and never falls back to a browser session. The credential is
 * not ambient, so Fetch Metadata is not consulted, but an explicit untrusted
 * `Origin` on an unsafe method is still refused.
 */
export function createImportActorResolver(input: {
  readonly origin: URL;
  readonly production: boolean;
  readonly security: Pick<SecurityService, "resolveImportToken">;
  readonly now?: () => number;
}): { resolve(request: Request): Promise<ImportActorResolution | null> } {
  const allowedOrigins = trustedOrigins(input.origin, input.production);
  return Object.freeze({
    resolve: async (request: Request) => {
      const origin = request.headers.get("origin");
      if (
        !["GET", "HEAD", "OPTIONS"].includes(request.method) &&
        origin !== null &&
        !allowedOrigins.includes(origin)
      )
        return null;
      if (new URL(request.url).searchParams.has("access_token")) return null;
      const match = /^Bearer ([A-Za-z0-9_-]{1,4096})$/u.exec(
        request.headers.get("authorization") ?? "",
      );
      if (match === null) return null;
      const resolved = await input.security.resolveImportToken({
        now: (input.now ?? Date.now)() as never,
        token: opaqueTokenSecret(match[1]!),
      });
      const role = resolved === null ? undefined : laceRole(resolved.creator.role);
      if (resolved === null || role === undefined) return null;
      return Object.freeze({
        actor: attenuateActor(
          { id: actorId(resolved.creator.id), role },
          importTokenAuthority(resolved.token),
        ),
        token: resolved.token,
      });
    },
  });
}
