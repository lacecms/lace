import { AuthorizationError, notFound, response, validationHook } from "../shared/http.js";
import {
  authenticationFailure,
  authorizationFailure,
  describePolicy,
  validationFailure,
} from "../shared/openapi.js";
import {
  effectiveActorPermissions,
  importTokenCapabilities,
  importTokenExpiry,
} from "@lacecms/application";
import type { TokenSecurityPort } from "@lacecms/application";
import {
  errorEnvelopeSchema,
  buildTokenCreateRequestSchema,
  buildTokenCreatedSchema,
  buildTokenListSchema,
  buildTokenSchema,
  importCredentialSchema,
  importTokenCreateRequestSchema,
  importTokenCreatedSchema,
  importTokenListSchema,
  importTokenSchema,
  toImportTokenDto,
  toIsoTimestamp,
} from "@lacecms/contracts";
import { Hono } from "hono";
import { resolver, validator } from "hono-openapi";
import * as v from "valibot";
import type { RouteContext } from "../composition/route-context.js";
import { v1Routes } from "../routing/v1-routes.js";

function buildTokenDto(
  value:
    | Awaited<ReturnType<TokenSecurityPort["createBuildToken"]>>
    | Awaited<ReturnType<TokenSecurityPort["listBuildTokens"]>>[number],
) {
  return {
    capabilities: ["content:build:read"] as const,
    createdAt: toIsoTimestamp(value.createdAt),
    id: value.id,
    ...(value.lastUsedAt === undefined ? {} : { lastUsedAt: toIsoTimestamp(value.lastUsedAt) }),
    name: value.name,
    ...(value.revokedAt === undefined ? {} : { revokedAt: toIsoTimestamp(value.revokedAt) }),
    tokenPrefix: value.tokenPrefix,
  };
}

const routes = v1Routes.credentials;

export function registerCredentialRoutes(app: Hono, routeContext: RouteContext): void {
  const { actor, settingsActor } = routeContext.actors;
  const { tokenSecurity } = routeContext.capabilities;
  app.on(
    routes.listBuild.method,
    routes.listBuild.path,
    describePolicy(routes.listBuild, {
      summary: "List build tokens",
      tags: ["admin"],
      responses: {
        200: {
          description: "Build token metadata",
          content: { "application/json": { schema: resolver(buildTokenListSchema) } },
        },
        ...authenticationFailure(),
        ...authorizationFailure(),
      },
    }),
    async (context) => {
      await settingsActor(context);
      return response(buildTokenListSchema, {
        items: (await tokenSecurity().listBuildTokens()).map(buildTokenDto),
      });
    },
  );
  app.on(
    routes.issueBuild.method,
    routes.issueBuild.path,
    describePolicy(routes.issueBuild, {
      summary: "Create a build token",
      tags: ["admin"],
      responses: {
        201: {
          description: "The created token; the plaintext is returned only here",
          content: { "application/json": { schema: resolver(buildTokenCreatedSchema) } },
        },
        ...authenticationFailure(),
        ...authorizationFailure(),
        ...validationFailure(),
      },
    }),
    validator("json", buildTokenCreateRequestSchema, validationHook),
    async (context) => {
      await settingsActor(context);
      const body = context.req.valid("json") as v.InferOutput<typeof buildTokenCreateRequestSchema>;
      const token = await tokenSecurity().createBuildToken({
        name: body.name,
        now: Date.now() as never,
      });
      return response(
        buildTokenCreatedSchema,
        { ...buildTokenDto(token), token: token.token },
        201,
      );
    },
  );
  app.on(
    routes.revokeBuild.method,
    routes.revokeBuild.path,
    describePolicy(routes.revokeBuild, {
      summary: "Revoke a build token",
      tags: ["admin"],
      parameters: [{ name: "tokenId", in: "path", required: true, schema: { type: "string" } }],
      responses: {
        200: {
          description: "Revoked build token metadata",
          content: { "application/json": { schema: resolver(buildTokenSchema) } },
        },
        ...authenticationFailure(),
        ...authorizationFailure(),
        404: {
          description: "Token not found",
          content: { "application/json": { schema: resolver(errorEnvelopeSchema) } },
        },
      },
    }),
    async (context) => {
      await settingsActor(context);
      const token = await tokenSecurity().revokeBuildToken({
        now: Date.now() as never,
        tokenId: context.req.param("tokenId"),
      });
      return token === null ? notFound() : response(buildTokenSchema, buildTokenDto(token));
    },
  );
  /** Import-token administration needs a browser session; Bearer requests never reach it. */
  app.on(
    routes.listImport.method,
    routes.listImport.path,
    describePolicy(routes.listImport, {
      responses: {
        200: {
          content: { "application/json": { schema: resolver(importTokenListSchema) } },
          description: "Import-token metadata, newest first; never the plaintext",
        },
        ...authenticationFailure(),
        ...authorizationFailure(),
      },
      summary: "List import tokens. Requires a session with settings:manage.",
      tags: ["admin"],
    }),
    async (context) => {
      await settingsActor(context);
      return response(importTokenListSchema, {
        items: (await tokenSecurity().listImportTokens()).map(toImportTokenDto),
      });
    },
  );
  app.on(
    routes.issueImport.method,
    routes.issueImport.path,
    describePolicy(routes.issueImport, {
      requestBody: {
        content: { "application/json": { schema: resolver(importTokenCreateRequestSchema) } },
      },
      responses: {
        201: {
          content: { "application/json": { schema: resolver(importTokenCreatedSchema) } },
          description: "The created token; the plaintext is returned only here",
        },
        ...authenticationFailure(),
        ...authorizationFailure(),
        ...validationFailure(),
      },
      summary:
        "Create an import token for lace import (1–7 days; publishing only for creators with content:publish). Requires a session with settings:manage.",
      tags: ["admin"],
    }),
    validator("json", importTokenCreateRequestSchema, validationHook),
    async (context) => {
      const resolvedActor = await settingsActor(context);
      const body = context.req.valid("json") as v.InferOutput<
        typeof importTokenCreateRequestSchema
      >;
      const now = Date.now() as never;
      const token = await tokenSecurity().createImportToken({
        capabilities: importTokenCapabilities(resolvedActor, body.allowPublish),
        createdBy: resolvedActor.id,
        expiresAt: importTokenExpiry(now, body.expiresInDays),
        name: body.name,
        now,
      });
      return response(
        importTokenCreatedSchema,
        { ...toImportTokenDto(token), token: token.token },
        201,
      );
    },
  );
  app.on(
    routes.revokeImport.method,
    routes.revokeImport.path,
    describePolicy(routes.revokeImport, {
      responses: {
        200: {
          content: { "application/json": { schema: resolver(importTokenSchema) } },
          description: "The revoked token (idempotent)",
        },
        ...authenticationFailure(),
        ...authorizationFailure(),
        404: {
          content: { "application/json": { schema: resolver(errorEnvelopeSchema) } },
          description: "Token not found",
        },
      },
      summary: "Revoke an import token. Requires a session with settings:manage.",
      tags: ["admin"],
    }),
    async (context) => {
      await settingsActor(context);
      const token = await tokenSecurity().revokeImportToken({
        now: Date.now() as never,
        tokenId: context.req.param("tokenId"),
      });
      return token === null ? notFound() : response(importTokenSchema, toImportTokenDto(token));
    },
  );
  /** Describes the presented import token; only an import token reaches this route. */
  app.on(
    routes.describeImport.method,
    routes.describeImport.path,
    describePolicy(routes.describeImport, {
      responses: {
        200: {
          content: { "application/json": { schema: resolver(importCredentialSchema) } },
          description: "The presented import token and the effective permissions",
        },
        ...authenticationFailure(),
        ...authorizationFailure(),
      },
      summary:
        "Describe the presented import token. Accepts only Authorization: Bearer <import token>.",
      tags: ["admin"],
    }),
    async (context) => {
      const resolvedActor = await actor(context);
      const token = context.get("lace.importToken");
      // A session actor cannot describe an import credential.
      if (token === undefined) throw new AuthorizationError();
      return response(
        importCredentialSchema,
        {
          permissions: [...effectiveActorPermissions(resolvedActor)],
          token: toImportTokenDto(token),
        },
        200,
        { "cache-control": "no-store" },
      );
    },
  );
}
