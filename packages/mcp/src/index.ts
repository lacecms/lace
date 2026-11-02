import { McpServer, createMcpHandler } from "@modelcontextprotocol/server";
import { toJsonSchema } from "@valibot/to-json-schema";
import * as v from "valibot";
import {
  canContentOperation,
  authorizeContentOperation,
  opaqueCursor,
  type ContentOperation,
  type ContentUseCases,
} from "@lacecms/application";
import { contentEntryId, type Actor } from "@lacecms/domain";
import {
  mcpToolArgumentSchemas,
  publishContentEntryResultSchema,
  toPublishContentEntryResultDto,
  mcpListEntriesEnvelopeSchema,
  contractJsonSchemaOverride,
  toContentBlockInput,
  toContentModelDiscoveryDto,
  toContentEntryListDto,
  toAdminEntryProjectionDto,
  contentModelListSchema,
  contentEntryListSchema,
  adminContentEntrySchema,
  classifyError,
  ContractValidationError,
  LaceError,
  toContractValidationIssues,
} from "@lacecms/contracts";

export const packageName = "@lacecms/mcp";
type ToolName = keyof typeof mcpToolArgumentSchemas;
function argumentsFor<S extends v.BaseSchema<unknown, unknown, v.BaseIssue<unknown>>>(
  schema: S,
  value: unknown,
): v.InferOutput<S> {
  const result = v.safeParse(schema, value);
  if (!result.success) throw new ContractValidationError(toContractValidationIssues(result.issues));
  return result.output;
}
const tools: readonly {
  readonly name: ToolName;
  readonly operation: ContentOperation;
  readonly description: string;
}[] = Object.freeze([
  {
    name: "list_content_models",
    operation: "discoverModels",
    description:
      "Inspect content models and their fields, blocks and query limits. A field named under an owner's `visibility` applies only while its sibling controller holds one of the listed values.",
  },
  {
    name: "list_entries",
    operation: "list",
    description: "List and filter draft entries for one content model.",
  },
  {
    name: "get_entry",
    operation: "load",
    description: "Read an entry, its draft revision and published snapshot.",
  },
  {
    name: "create_entry",
    operation: "create",
    description:
      "Create an unpublished entry from a complete draft. Fill a conditional field only when its controller selects it; values of hidden fields are kept and validated as drafts. Re-read after an uncertain outcome; creation is not idempotent.",
  },
  {
    name: "publish_entry",
    operation: "publish",
    description:
      "Publish the saved draft at the expected revision. Requires content:publish. Hidden conditional fields are not required and their values are never published. Retry with the same idempotencyKey after an uncertain outcome.",
  },
  {
    name: "save_draft",
    operation: "save",
    description:
      "Replace the complete draft using the explicit expected revision. Values of hidden conditional fields are kept and validated as drafts. Does not publish or request a build.",
  },
]);

export interface McpToolCompletion {
  readonly actorId: string;
  readonly tool: ToolName;
  readonly outcome: "success" | "error";
  readonly durationMs: number;
}
/** A stateless protocol adapter over the same instances used by REST. */
export function createMcpContentHandler(input: {
  readonly content: ContentUseCases;
  readonly version: string;
}): {
  fetch(
    request: Request,
    actor: Actor,
    completed?: (event: McpToolCompletion) => void,
  ): Promise<Response>;
} {
  const content = input.content;
  const execute = async (
    name: ToolName,
    raw: unknown,
    actor: Actor,
  ): Promise<Record<string, unknown>> => {
    switch (name) {
      case "list_content_models": {
        argumentsFor(mcpToolArgumentSchemas.list_content_models, raw);
        return v.parse(
          contentModelListSchema,
          toContentModelDiscoveryDto(content.discoverModels({ actor })),
        );
      }
      case "list_entries": {
        const args = argumentsFor(mcpListEntriesEnvelopeSchema, raw);
        return v.parse(
          contentEntryListSchema,
          toContentEntryListDto(
            await content.list({
              actor,
              modelKey: args.modelKey,
              limit: args.limit,
              ...(args.after === undefined ? {} : { after: opaqueCursor(args.after) }),
              ...(args.q === undefined ? {} : { q: args.q }),
              ...(args.sort === undefined ? {} : { sort: args.sort }),
              ...(args.status === undefined ? {} : { status: args.status }),
              ...(args.filters === undefined ? {} : { filters: args.filters }),
            }),
          ),
        );
      }
      case "get_entry": {
        const args = argumentsFor(mcpToolArgumentSchemas.get_entry, raw);
        const entry = await content.loadAdminEntry({
          actor,
          entryId: contentEntryId(args.entryId),
        });
        if (!entry) return Promise.reject(new LaceError("NOT_FOUND", "Entry does not exist."));
        return v.parse(adminContentEntrySchema, toAdminEntryProjectionDto(entry));
      }
      case "create_entry": {
        const args = argumentsFor(mcpToolArgumentSchemas.create_entry, raw);
        const entry = await content.create({
          actor,
          modelKey: args.modelKey,
          title: args.title,
          blocks: args.blocks.map(toContentBlockInput),
          fields: args.fields,
          ...(args.slug === undefined ? {} : { slug: args.slug }),
          ...(args.seo === undefined ? {} : { seo: args.seo }),
        });
        return v.parse(
          adminContentEntrySchema,
          toAdminEntryProjectionDto(await content.projectAdminEntry({ actor, entry })),
        );
      }
      case "publish_entry": {
        const args = argumentsFor(mcpToolArgumentSchemas.publish_entry, raw);
        const result = await content.publish({
          actor,
          entryId: contentEntryId(args.entryId),
          expectedRevision: args.expectedRevision,
          ...(args.idempotencyKey === undefined ? {} : { idempotencyKey: args.idempotencyKey }),
        });
        return v.parse(
          publishContentEntryResultSchema,
          toPublishContentEntryResultDto(await content.projectPublicationResult({ actor, result })),
        );
      }
      case "save_draft": {
        const args = argumentsFor(mcpToolArgumentSchemas.save_draft, raw);
        const entry = await content.save({
          actor,
          entryId: contentEntryId(args.entryId),
          expectedRevision: args.expectedRevision,
          title: args.title,
          blocks: args.blocks.map(toContentBlockInput),
          fields: args.fields,
          ...(args.slug === undefined ? {} : { slug: args.slug }),
          ...(args.seo === undefined ? {} : { seo: args.seo }),
        });
        return v.parse(
          adminContentEntrySchema,
          toAdminEntryProjectionDto(await content.projectAdminEntry({ actor, entry })),
        );
      }
    }
  };
  return Object.freeze({
    fetch: async (
      request: Request,
      actor: Actor,
      completed?: (event: McpToolCompletion) => void,
    ) => {
      // Keep discovery attenuated, but let a denied publication call reach the
      // shared authorizer so role demotion returns the stable tool error.
      let publicationCall = false;
      if (request.method === "POST") {
        try {
          const message = (await request.clone().json()) as {
            method?: unknown;
            params?: { name?: unknown };
          } | null;
          publicationCall =
            message?.method === "tools/call" && message.params?.name === "publish_entry";
        } catch {
          /* Protocol syntax remains SDK-owned. */
        }
      }
      const handler = createMcpHandler(
        () => {
          const server = new McpServer({ name: "lace-content", version: input.version });
          for (const tool of tools) {
            if (
              !canContentOperation(actor, tool.operation) &&
              !(publicationCall && tool.name === "publish_entry")
            )
              continue;
            const schema = mcpToolArgumentSchemas[tool.name];
            const advertised = toJsonSchema(schema, {
              errorMode: "ignore",
              overrideSchema: ({ valibotSchema }) => contractJsonSchemaOverride(valibotSchema),
            });
            // Publish the derived JSON Schema; Valibot validates inside the callback
            // so invalid business arguments retain the shared safe error envelope.
            const json: Record<string, unknown> = { ...advertised };
            const inputSchema = {
              "~standard": {
                version: 1 as const,
                vendor: "lace-contracts",
                validate: (value: unknown) => ({ value }),
                jsonSchema: { input: () => json, output: () => json },
              },
            };
            server.registerTool(
              tool.name,
              {
                description: tool.description,
                inputSchema,
                annotations: {
                  readOnlyHint: ["discoverModels", "list", "load"].includes(tool.operation),
                  destructiveHint: false,
                  openWorldHint: false,
                },
              },
              async (raw: unknown) => {
                const started = Date.now();
                let outcome: "success" | "error" = "success";
                try {
                  authorizeContentOperation(actor, tool.operation);
                  const result = await execute(tool.name, raw, actor);
                  return {
                    content: [{ type: "text" as const, text: JSON.stringify(result) }],
                    structuredContent: result,
                  };
                } catch (error) {
                  outcome = "error";
                  const result = classifyError(error).body;
                  return {
                    isError: true,
                    content: [{ type: "text" as const, text: JSON.stringify(result) }],
                    structuredContent: result,
                  };
                } finally {
                  completed?.({
                    actorId: actor.id,
                    tool: tool.name,
                    outcome,
                    durationMs: Date.now() - started,
                  });
                }
              },
            );
          }
          return server;
        },
        { legacy: "stateless" },
      );
      try {
        return await handler.fetch(request);
      } finally {
        await handler.close();
      }
    },
  });
}
