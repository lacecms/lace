import { errorEnvelopeSchema, linkTargetQuerySchema } from "@lacecms/contracts";
import { resolver } from "hono-openapi";
import { expect, expectTypeOf, test } from "vitest";
import { authorizationFailure, validate, validationFailure } from "./openapi.js";

test("both failure responses resolve to the shared error envelope", async () => {
  const envelope = await resolver(errorEnvelopeSchema).toOpenAPISchema();
  const validation = validationFailure()[422];
  const authorization = authorizationFailure()[403];
  expect(validation.description).toContain("VALIDATION_FAILED");
  expect(authorization.description).toContain("AUTHORIZATION_DENIED");
  for (const documented of [validation, authorization])
    expect(await documented.content["application/json"].schema.toOpenAPISchema()).toEqual(envelope);
});

test("a route's own denial reason merges into the one 403 description", () => {
  expect(authorizationFailure("an invalid origin")[403].description).toBe(
    "Permission denied (AUTHORIZATION_DENIED); also an invalid origin",
  );
});

test("a validated query has the schema's transformed output in the handler", () => {
  const middleware = validate("query", linkTargetQuerySchema);
  type Context = Parameters<typeof middleware>[0];
  type Query = ReturnType<Context["req"]["valid"]>;
  expectTypeOf<Query["limit"]>().toEqualTypeOf<number>();
});
