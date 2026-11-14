import { errorEnvelopeSchema } from "@lacecms/contracts";
import { resolver } from "hono-openapi";
import type { ResolverReturnType } from "hono-openapi";

interface EnvelopeResponse {
  readonly content: { readonly "application/json": { readonly schema: ResolverReturnType } };
  readonly description: string;
}

function envelopeResponse(description: string): EnvelopeResponse {
  return {
    content: { "application/json": { schema: resolver(errorEnvelopeSchema) } },
    description,
  };
}

/** The `422 VALIDATION_FAILED` answer of `validationHook` and every hand parser. */
export function validationFailure(): { readonly 422: EnvelopeResponse } {
  return {
    422: envelopeResponse("The request did not satisfy the API contract (VALIDATION_FAILED)"),
  };
}

/**
 * The classified `403 AUTHORIZATION_DENIED` for a missing, invalid or
 * insufficient credential; no Lace error maps to `401`. `alsoMeans` merges a
 * route's own denial reason into the one `403` description.
 */
export function authorizationFailure(alsoMeans?: string): { readonly 403: EnvelopeResponse } {
  return {
    403: envelopeResponse(
      `Authentication or permission required (AUTHORIZATION_DENIED)${
        alsoMeans === undefined ? "" : `; also ${alsoMeans}`
      }`,
    ),
  };
}

/** Security requirements per credential boundary (ADR 0016, architecture §14). */
export const security: Readonly<
  Record<"build" | "import" | "importOnly" | "none" | "session", Record<string, string[]>[]>
> = Object.freeze({
  /** The public build export. */
  build: [{ buildToken: [] }],
  /** Routes on `IMPORT_ROUTE_ALLOWLIST`: a session or an import token. */
  import: [{ session: [] }, { importToken: [] }],
  /** The allowlisted route that describes the presented import token. */
  importOnly: [{ importToken: [] }],
  /** Public reads and token-in-body account flows. */
  none: [],
  /** Admin and account routes. */
  session: [{ session: [] }],
});

/** The schemes `security` names, declared once in the generated document. */
export const securitySchemes = {
  buildToken: {
    description: "A build token from Settings → API tokens, sent as `Authorization: Bearer`.",
    scheme: "bearer",
    type: "http",
  },
  importToken: {
    description:
      "An import token for `lace import`, sent as `Authorization: Bearer`. A Bearer credential on a management route never falls back to the session.",
    scheme: "bearer",
    type: "http",
  },
  session: {
    description:
      "The Better Auth browser session cookie. Over HTTPS its name carries the `__Secure-` prefix.",
    in: "cookie",
    name: "better-auth.session_token",
    type: "apiKey",
  },
} as const;
