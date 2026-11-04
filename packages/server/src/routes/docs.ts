import {
  fieldMetadataSchema,
  fieldMetadataMapSchema,
  blockMetadataSchema,
  fieldVisibilitySchema,
  contentMetadataOpenApi,
} from "@lacecms/contracts";
import { Scalar } from "@scalar/hono-api-reference";
import { toJsonSchema } from "@valibot/to-json-schema";
import type { Hono } from "hono";
import { describeRoute, loadVendor, openAPIRouteHandler } from "hono-openapi";
import type { GenerateSpecOptions } from "hono-openapi";
import type { RouteContext } from "../composition/route-context.js";

loadVendor("valibot", {
  toJSONSchema: ((
    schema: Parameters<typeof toJsonSchema>[0],
    config: Parameters<typeof toJsonSchema>[1],
  ) =>
    toJsonSchema(schema, {
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
                  : undefined;
        return name === undefined ? undefined : { $ref: `#/components/schemas/${name}` };
      },
    })) as never,
});

export function registerDocsRoutes(app: Hono, routeContext: RouteContext): void {
  const { input } = routeContext;
  app.get(
    "/api/v1/openapi.json",
    openAPIRouteHandler(app, {
      documentation: {
        info: { title: input.environment.openApiTitle, version: input.environment.engineVersion },
        openapi: "3.1.0",
        components: {
          schemas: contentMetadataOpenApi as NonNullable<
            NonNullable<GenerateSpecOptions["documentation"]["components"]>["schemas"]
          >,
        },
      },
    }),
  );

  if (input.apiDocsEnabled === true) {
    app.get(
      "/api/docs",
      describeRoute({ hide: true }),
      Scalar({
        url: "/api/v1/openapi.json",
        pageTitle: "Lace API documentation",
        cdn: "https://cdn.jsdelivr.net/npm/@scalar/api-reference@1.75.0/dist/browser/standalone.js",
        servers: [{ url: "/" }],
        persistAuth: false,
        telemetry: false,
        withDefaultFonts: false,
        showDeveloperTools: "never",
        hideClientButton: true,
        // Supported by the pinned browser bundle, ahead of the Hono wrapper's types.
        ...{ agent: { disabled: true } },
        mcp: { disabled: true },
      }),
    );
  }
}
