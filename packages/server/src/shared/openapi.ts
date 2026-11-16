import { errorEnvelopeSchema } from "@lacecms/contracts";
import { sValidator } from "@hono/standard-validator";
import { toJsonSchema } from "@valibot/to-json-schema";
import type { Env, ValidationTargets } from "hono";
import { describeRoute, resolver, uniqueSymbol } from "hono-openapi";
import type { DescribeRouteOptions, HandlerUniqueProperty, ResolverReturnType } from "hono-openapi";
import type { InferInput, InferOutput } from "valibot";
import type { RestCredentialMode, RoutePolicy } from "../routing/route-policy.js";
import { withRoutePolicy } from "../routing/route-matching.js";
import { validationHook, type ServerSchema, type validationResponse } from "./http.js";

type Validator<Schema extends ServerSchema, Target extends keyof ValidationTargets> = ReturnType<
  typeof sValidator<Schema, Target, Env, string, InferInput<Schema>, InferOutput<Schema>>
>;

export function validate<Schema extends ServerSchema, Target extends keyof ValidationTargets>(
  target: Target,
  schema: Schema,
): (...args: Parameters<Validator<Schema, Target>>) => ReturnType<typeof validationResponse> {
  const middleware = sValidator(target, schema, validationHook);
  // Keep sValidator's hook response type and the metadata hono-openapi reads.
  const metadata = { target, ...resolver(schema) } satisfies HandlerUniqueProperty;
  Object.assign(middleware, { [uniqueSymbol]: metadata });
  return middleware;
}

type OpenApiParameter = Exclude<
  NonNullable<DescribeRouteOptions["parameters"]>[number],
  { $ref: string }
>;
type OpenApiParameterSchema = NonNullable<OpenApiParameter["schema"]>;

export function openApiParameterSchema(
  schema: Parameters<typeof toJsonSchema>[0],
  options?: Parameters<typeof toJsonSchema>[1],
): OpenApiParameterSchema {
  // Valibot's JSON Schema is wider than the OpenAPI parameter type.
  return toJsonSchema(schema, options) as OpenApiParameterSchema;
}

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
