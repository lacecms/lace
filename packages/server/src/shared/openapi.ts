import { errorEnvelopeSchema } from "@lacecms/contracts";
import { describeRoute, resolver } from "hono-openapi";
import type { DescribeRouteOptions, ResolverReturnType } from "hono-openapi";
import type { RestCredentialMode, RoutePolicy } from "../routing/route-policy.js";
import { withRoutePolicy } from "../routing/route-matching.js";

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

/** A missing or rejected credential. */
export function authenticationFailure(): { readonly 401: EnvelopeResponse } {
  return { 401: envelopeResponse("Authentication required (AUTHENTICATION_REQUIRED)") };
}

/** An authenticated actor or request shape is refused. */
export function authorizationFailure(alsoMeans?: string): { readonly 403: EnvelopeResponse } {
  return {
    403: envelopeResponse(
      `Permission denied (AUTHORIZATION_DENIED)${
        alsoMeans === undefined ? "" : `; also ${alsoMeans}`
      }`,
    ),
  };
}

/** Security requirements per credential boundary (ADR 0016, architecture §14). */
const security: Readonly<Record<RestCredentialMode, Record<string, string[]>[]>> = Object.freeze({
  /** The public build export. */
  build: [{ buildToken: [] }],
  /** Routes on `IMPORT_ROUTE_ALLOWLIST`: a session or an import token. */
  "session-or-import": [{ session: [] }, { importToken: [] }],
  /** The allowlisted route that describes the presented import token. */
  "import-only": [{ importToken: [] }],
  /** Public reads and token-in-body account flows. */
  public: [],
  /** Admin and account routes. */
  session: [{ session: [] }],
});

export function describePolicy(
  policy: RoutePolicy<string, RestCredentialMode>,
  description: Omit<DescribeRouteOptions, "security">,
) {
  return withRoutePolicy(
    policy,
    describeRoute({ ...description, security: security[policy.auth] }),
  );
}

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
