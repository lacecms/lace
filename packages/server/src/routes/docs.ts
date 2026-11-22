import {
  fieldMetadataSchema,
  fieldMetadataMapSchema,
  blockMetadataSchema,
  fieldVisibilitySchema,
  contentMetadataOpenApi,
  errorEnvelopeSchema,
  validationErrorDetailsSchema,
} from "@lacecms/contracts";
import { Scalar } from "@scalar/hono-api-reference";
import { toJsonSchema } from "@valibot/to-json-schema";
import type { Hono } from "hono";
import { loadVendor, openAPIRouteHandler } from "hono-openapi";
import type { GenerateSpecOptions } from "hono-openapi";
import type { RouteContext } from "../composition/route-context.js";
import { describePolicy, securitySchemes } from "../shared/openapi.js";
import { outerRoutes } from "../routing/outer-routes.js";
import { API_V1, v1Routes } from "../routing/v1-routes.js";
import { withRoutePolicy } from "../routing/route-matching.js";

type ValibotVendorConverter = NonNullable<Parameters<typeof loadVendor>[1]["toJSONSchema"]>;

loadVendor("valibot", {
  // The registry dispatches this converter only for Valibot schemas.
  toJSONSchema: (schema, config) =>
    toJsonSchema(schema as Parameters<typeof toJsonSchema>[0], {
      ...config,
      overrideSchema: ({ valibotSchema }) => {
        const name =
          valibotSchema === fieldMetadataSchema
            ? "FieldDefinition"
            : valibotSchema === fieldMetadataMapSchema
              ? "FieldMetadataMap"
              : valibotSchema === blockMetadataSchema
                ? "BlockMetadata"
                : valibotSchema === fieldVisibilitySchema
                  ? "FieldVisibility"
                  : valibotSchema === errorEnvelopeSchema
                    ? "ErrorEnvelope"
                    : undefined;
        return name === undefined ? undefined : { $ref: `#/components/schemas/${name}` };
      },
    }) as Awaited<ReturnType<ValibotVendorConverter>>,
});

/** The shared failure body (ADR 0019), referenced by every documented error response. */
const { $schema: _dialect, ...errorEnvelopeComponent } = toJsonSchema(errorEnvelopeSchema, {
  errorMode: "ignore",
});

const { $schema: _detailDialect, ...validationDetails } = toJsonSchema(
  validationErrorDetailsSchema,
  { errorMode: "ignore" },
);

// OpenAPI 3.1 accepts JSON Schema conditionals, which the route generator's
// SchemaObject type omits. Keep validation evidence on the shared envelope.
const validationDetailsCondition = {
  type: "object",
  if: { properties: { error: { properties: { code: { const: "VALIDATION_FAILED" } } } } },
  // oxlint-disable-next-line unicorn/no-thenable -- JSON Schema conditional keyword.
  then: { properties: { error: { properties: { details: validationDetails } } } },
} as const;

export function registerOpenApiRoute(v1: Hono, app: Hono, routeContext: RouteContext): void {
  const { capabilities } = routeContext;
  const route = v1Routes.documentation.openApi;
  v1.on(
    route.method,
    route.path,
    withRoutePolicy(
      route,
      openAPIRouteHandler(app, {
        // Validation failures are `422` in the shared envelope, documented per route.
        defaultValidationErrorResponse: false,
        documentation: {
          info: {
            title: capabilities.environment.openApiTitle,
            version: capabilities.environment.engineVersion,
          },
          openapi: "3.1.0",
          components: {
            schemas: {
              ...contentMetadataOpenApi,
              ErrorEnvelope: {
                ...errorEnvelopeComponent,
                allOf: [validationDetailsCondition],
              },
            } as NonNullable<
              NonNullable<GenerateSpecOptions["documentation"]["components"]>["schemas"]
            >,
            securitySchemes,
          },
        },
      }),
    ),
  );
}

export function registerDocsRoutes(app: Hono, routeContext: RouteContext): void {
  const { capabilities } = routeContext;
  if (capabilities.apiDocsEnabled === true) {
    // Supported by the pinned browser bundle, ahead of the Hono wrapper's types.
    const scalarBundleOnlyOptions = { agent: { disabled: true } };
    const route = outerRoutes.reference;
    app.on(
      route.method,
      route.path,
      describePolicy(route, { hide: true }),
      Scalar({
        url: `${API_V1}${v1Routes.documentation.openApi.path}`,
        pageTitle: "Lace API documentation",
        cdn: "https://cdn.jsdelivr.net/npm/@scalar/api-reference@1.75.0/dist/browser/standalone.js",
        servers: [{ url: "/" }],
        persistAuth: false,
        telemetry: false,
        withDefaultFonts: false,
        showDeveloperTools: "never",
        hideClientButton: true,
        ...scalarBundleOnlyOptions,
        mcp: { disabled: true },
      }),
    );
  }
}
