import { OAuthConnectionUseCases } from "@lacecms/application";
import { MAX_PAGE_SIZE } from "@lacecms/contracts";
import { unixMilliseconds } from "@lacecms/domain";
import { uniqueSymbol } from "hono-openapi";
import { expect, test } from "vitest";
import { isImportRoute } from "../security/import-routes.js";
import { validationFailure } from "../shared/openapi.js";
import { buildTokenSecurity, fixture, json } from "../test-support/app-harness.js";

interface Operation {
  readonly parameters?: readonly {
    readonly in: string;
    readonly name: string;
    readonly required?: boolean;
    readonly schema?: Record<string, unknown>;
  }[];
  readonly responses?: Record<
    string,
    {
      readonly description?: string;
      readonly content?: Record<string, { schema?: unknown }>;
      readonly headers?: Record<string, { schema?: unknown }>;
    }
  >;
  readonly requestBody?: {
    readonly content?: Record<string, { schema?: unknown }>;
  };
  readonly security?: readonly Record<string, readonly string[]>[];
  readonly summary?: string;
  readonly tags?: readonly string[];
}

interface Document {
  readonly components: {
    readonly schemas?: Record<string, unknown>;
    readonly securitySchemes?: Record<string, Record<string, unknown>>;
  };
  readonly paths: Record<string, Record<string, Operation>>;
}

/** Routes that validate input in the handler instead of through `validator()`. */
const HAND_PARSED = new Set([
  "DELETE /api/v1/account/sessions/:sessionId",
  "DELETE /api/v1/admin/invitations/:invitationId",
  "GET /api/v1/admin/site-builds/:buildId",
  "GET /api/v1/public/build-export",
  "GET /api/v1/public/content/by-path",
  "POST /api/v1/account/mcp-connections/:connectionId/revoke",
  "POST /api/v1/account/sessions/revoke-others",
  "POST /api/v1/admin/builds",
  "POST /api/v1/admin/builds/:buildId/retry",
  "POST /api/v1/admin/invitations/:invitationId/resend",
  "POST /api/v1/admin/media",
  "POST /api/v1/admin/users/:userId/password-reset",
  "POST /api/v1/admin/users/:userId/sessions/revoke",
]);

/** `400` answers that are classified failures, not validation (`INVALID_CREDENTIALS`). */
const CLASSIFIED_BAD_REQUESTS = new Set(["POST /api/v1/account/password"]);

const ENVELOPE_REF = "#/components/schemas/ErrorEnvelope";

/** The one allowlisted route that refuses a browser session (ADR 0016). */
const IMPORT_TOKEN_ONLY = new Set(["GET /api/v1/admin/import-credential"]);

async function generated() {
  const unused = async () => {
    throw new Error("OpenAPI generation must not call connection storage");
  };
  const { app } = await fixture({
    security: buildTokenSecurity,
    oauthConnections: new OAuthConnectionUseCases({
      clock: { now: () => unixMilliseconds(0) },
      connections: { listConnections: unused, revokeConnection: unused, invalidateUser: unused },
    }),
  });
  const doc = (await json(app, "/api/v1/openapi.json")).body as Document;
  const routes = new Map<string, { method: string; path: string; validated: boolean }>();
  for (const route of app.routes) {
    if (route.method === "ALL" || !route.path.startsWith("/api/v1/")) continue;
    if (route.path === "/api/v1/openapi.json") continue;
    const key = `${route.method} ${route.path}`;
    const marker = (route.handler as unknown as Record<symbol, { target?: string } | undefined>)[
      uniqueSymbol
    ];
    const known = routes.get(key);
    routes.set(key, {
      method: route.method,
      path: route.path,
      validated: known?.validated === true || marker?.target !== undefined,
    });
  }
  return { doc, routes: [...routes.entries()] };
}

function operationOf(doc: Document, method: string, path: string): Operation | undefined {
  return doc.paths[path.replace(/:([A-Za-z]+)/gu, "{$1}")]?.[method.toLowerCase()];
}

function resolved(doc: Document, schema: unknown): Record<string, unknown> {
  const ref = (schema as { $ref?: string } | undefined)?.$ref;
  if (ref === undefined) return schema as Record<string, unknown>;
  return doc.components.schemas?.[ref.split("/").at(-1)!] as Record<string, unknown>;
}

test("every registered product route is documented as the server enforces it", async () => {
  const { doc, routes } = await generated();
  expect(routes.length).toBeGreaterThan(50);
  const violations: string[] = [];
  const declared = new Set(Object.keys(doc.components.securitySchemes ?? {}));
  for (const [key, route] of routes) {
    const operation = operationOf(doc, route.method, route.path);
    const fail = (rule: string) => violations.push(`${key}: ${rule}`);
    if (operation === undefined) {
      fail("not documented");
      continue;
    }
    const responses = operation.responses ?? {};
    const statuses = Object.keys(responses);
    if (!operation.summary) fail("no summary");
    if ((operation.tags ?? []).length === 0) fail("no tag");
    if (!statuses.some((status) => /^2\d\d$/u.test(status))) fail("no success status");
    for (const [status, documented] of Object.entries(responses))
      if (documented.description === "Validation Error") fail(`default validation ${status}`);
    if (
      statuses.includes("400") &&
      !(CLASSIFIED_BAD_REQUESTS.has(key) && responses["400"]?.description?.includes("INVALID_"))
    )
      fail("documents 400; validation failures are 422");
    const validates = route.validated || HAND_PARSED.has(key);
    const documents422 = responses["422"]?.description === validationFailure()[422].description;
    if (validates && !documents422) fail("validates input but does not document the shared 422");
    for (const status of ["401", "403", "422"]) {
      const schema = responses[status]?.content?.["application/json"]?.schema;
      if (status in responses && (schema as { $ref?: string })?.$ref !== ENVELOPE_REF)
        fail(`${status} is not the shared ErrorEnvelope`);
    }
    if (!validates && statuses.includes("422")) fail("documents 422 without validating input");

    const security = operation.security;
    if (security === undefined) {
      fail("no explicit security");
      continue;
    }
    const schemes = security.flatMap((requirement) => Object.keys(requirement));
    for (const scheme of schemes) if (!declared.has(scheme)) fail(`undeclared scheme ${scheme}`);
    const samplePath = route.path.replace(/:[A-Za-z]+/gu, "x");
    if (schemes.includes("importToken") !== isImportRoute(route.method, samplePath))
      fail("importToken annotation disagrees with isImportRoute");
    const management = /^\/api\/v1\/(?:admin|account)(?:\/|$)/u.test(route.path);
    if (management && !IMPORT_TOKEN_ONLY.has(key) && !schemes.includes("session"))
      fail("management route without session security");
    if (!management && schemes.includes("session")) fail("session security outside management");
    if (schemes.length > 0 && !statuses.includes("401")) fail("accepts a credential but lacks 401");
    if (schemes.length === 0 && (statuses.includes("401") || statuses.includes("403")))
      fail("public operation documents 401 or 403");
  }
  expect(violations).toEqual([]);
});

test("entry detail and draft mutations document the same revision tag", async () => {
  const { doc } = await generated();
  const path = "/api/v1/admin/entries/:entryId";
  const tag = operationOf(doc, "GET", path)?.responses?.["200"]?.headers?.ETag?.schema;
  expect(tag).toMatchObject({ type: "string", example: '"7"' });
  for (const [method, suffix] of [
    ["PUT", "/draft"],
    ["POST", "/publish"],
    ["POST", "/revert"],
    ["POST", "/duplicate"],
    ["DELETE", ""],
  ] as const) {
    expect(operationOf(doc, method, path + suffix)?.parameters).toContainEqual(
      expect.objectContaining({ in: "header", name: "If-Match", required: false, schema: tag }),
    );
  }
});

test("protected list operations document the common pagination contract", async () => {
  const { doc } = await generated();
  for (const path of [
    "/api/v1/admin/users",
    "/api/v1/admin/invitations",
    "/api/v1/admin/site-builds",
    "/api/v1/account/mcp-connections",
    "/api/v1/admin/models/:modelKey/entries",
    "/api/v1/admin/media",
  ]) {
    const operation = operationOf(doc, "GET", path);
    const after = operation?.parameters?.find((parameter) => parameter.name === "after");
    const limit = operation?.parameters?.find((parameter) => parameter.name === "limit");
    expect(after?.schema, path).toMatchObject({ type: "string", maxLength: 4096 });
    expect(limit?.schema, path).toMatchObject({ type: "string", default: "50" });
    const grammar = new RegExp(String(limit?.schema?.pattern), "u");
    expect(["1", "100", "0", "101"].map((size) => grammar.test(size))).toEqual([
      true,
      true,
      false,
      false,
    ]);
    const page = resolved(
      doc,
      operation?.responses?.["200"]?.content?.["application/json"]?.schema,
    );
    expect(page.properties, path).toHaveProperty("nextCursor.type", "string");
    expect(page.required, path).not.toContain("nextCursor");
    expect(operation?.responses?.["422"], path).toBeDefined();
    if (path === "/api/v1/admin/users") {
      expect(page.required).toEqual(expect.arrayContaining(["items", "total", "disabledCount"]));
    }
  }
  const disabled = await fixture();
  const live = (await json(disabled.app, "/api/v1/openapi.json")).body as Document;
  expect(live.paths).not.toHaveProperty("/api/v1/account/mcp-connections");
  expect(live.paths).not.toHaveProperty("/api/v1/account/mcp-connections/{connectionId}/revoke");
});

test("token creation documents 201 with the one-time token value", async () => {
  const { doc } = await generated();
  const created = operationOf(doc, "POST", "/api/v1/admin/api-tokens")?.responses?.["201"];
  expect(created).toBeDefined();
  const schema = resolved(doc, created?.content?.["application/json"]?.schema);
  expect(schema.properties).toHaveProperty("token");
});

test("hand-parsed public query parameters are documented with their bounds", async () => {
  const { doc } = await generated();
  for (const path of ["/api/v1/public/collections/:modelKey", "/api/v1/public/records/:modelKey"]) {
    const parameters = operationOf(doc, "GET", path)?.parameters ?? [];
    const query = new Map(parameters.filter((p) => p.in === "query").map((p) => [p.name, p]));
    expect(query.get("after")?.required, path).toBe(false);
    expect(query.get("limit")?.schema, path).toMatchObject({
      maximum: MAX_PAGE_SIZE,
      minimum: 1,
      type: "integer",
    });
  }
  const byPath = operationOf(doc, "GET", "/api/v1/public/content/by-path")?.parameters ?? [];
  expect(byPath).toContainEqual(
    expect.objectContaining({ in: "query", name: "path", required: true }),
  );
});

test("credentials are declared once and applied per boundary", async () => {
  const { doc } = await generated();
  expect(doc.components.securitySchemes).toMatchObject({
    buildToken: { scheme: "bearer", type: "http" },
    importToken: { scheme: "bearer", type: "http" },
    session: { in: "cookie", type: "apiKey" },
  });
  expect(operationOf(doc, "GET", "/api/v1/public/pages/:modelKey")?.security).toEqual([]);
  expect(operationOf(doc, "GET", "/api/v1/public/build-export")?.security).toEqual([
    { buildToken: [] },
  ]);
  expect(operationOf(doc, "PUT", "/api/v1/admin/entries/:entryId/draft")?.security).toEqual([
    { session: [] },
    { importToken: [] },
  ]);
  expect(JSON.stringify(doc)).not.toContain('"Validation Error"');
});

test("reference management documents browser sessions, bounds and distinct lifecycle conflicts", async () => {
  const { doc } = await generated();
  const admin = "/api/v1/admin";
  const picker = operationOf(doc, "GET", `${admin}/reference-targets`)!;
  const resolve = operationOf(doc, "POST", `${admin}/reference-targets/resolve`)!;
  const entry = `${admin}/entries/:entryId`;
  const impact = operationOf(doc, "GET", `${entry}/reference-impact`)!;
  for (const operation of [picker, resolve, impact]) {
    expect(operation.security).toEqual([{ session: [] }]);
    expect(operation.responses?.["200"]).toBeDefined();
  }
  expect(picker.parameters?.find(({ name }) => name === "modelKey")).toMatchObject({
    required: true,
  });
  expect(impact.responses?.["409"]?.description).toContain("CONTENT_REFERENCE_IMPACT_CHANGED");
  expect(resolve.requestBody?.content?.["application/json"]?.schema).toMatchObject({
    type: "object",
    additionalProperties: false,
    properties: { ids: { maxItems: 200 } },
  });
  const deletion = operationOf(doc, "DELETE", entry)!;
  const withdrawal = operationOf(doc, "POST", `${entry}/unpublish`)!;
  expect(deletion.responses?.["409"]?.description).toContain("CONTENT_REFERENCE_REVIEW_REQUIRED");
  expect(withdrawal.responses?.["409"]?.description).toContain("CONTENT_REFERENCES_IN_USE");
  expect(deletion.requestBody?.content?.["application/json"]?.schema).toHaveProperty(
    "properties.referenceImpact.properties.acknowledgeDraftReferences.const",
    true,
  );
  expect(withdrawal.requestBody?.content?.["application/json"]?.schema).not.toHaveProperty(
    "properties.referenceImpact",
  );

  const envelope = doc.components.schemas?.ErrorEnvelope;
  expect(envelope).toHaveProperty(
    "allOf.0.if.properties.error.properties.code.const",
    "VALIDATION_FAILED",
  );
  expect(envelope).toHaveProperty(
    "allOf.0.then.properties.error.properties.details",
    expect.objectContaining({
      additionalProperties: false,
      properties: {
        issues: {
          type: "array",
          items: {
            anyOf: expect.arrayContaining([
              expect.objectContaining({
                additionalProperties: false,
                properties: expect.objectContaining({
                  code: { const: "reference_cycle" },
                  details: expect.objectContaining({
                    additionalProperties: false,
                    properties: expect.objectContaining({
                      witness: expect.objectContaining({ maxItems: 16 }),
                      publishFirst: expect.objectContaining({ additionalProperties: false }),
                    }),
                  }),
                }),
              }),
            ]),
          },
        },
      },
    }),
  );
});
