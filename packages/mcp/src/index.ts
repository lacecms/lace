import { McpServer, createMcpHandler } from "@modelcontextprotocol/server";
import { toJsonSchema } from "@valibot/to-json-schema";
import * as v from "valibot";
import {
  canContentOperation,
  opaqueCursor,
  type ContentOperation,
  type ContentUseCases,
} from "@lacecms/application";
import { contentEntryId, type Actor } from "@lacecms/domain";
import {
  mcpToolArgumentSchemas,
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
  validationError,
  toContractValidationIssues,
  transportError,
} from "@lacecms/contracts";

export const packageName = "@lacecms/mcp";
type ToolName = keyof typeof mcpToolArgumentSchemas;
class ArgumentFailure extends Error {
  public constructor(readonly body: ReturnType<typeof validationError>["body"]) {
    super("Invalid tool arguments.");
  }
}
function argumentsFor<S extends v.BaseSchema<unknown, unknown, v.BaseIssue<unknown>>>(
  schema: S,
  value: unknown,
): v.InferOutput<S> {
  const result = v.safeParse(schema, value);
  if (!result.success)
    throw new ArgumentFailure(validationError(toContractValidationIssues(result.issues)).body);
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
    description: "Inspect content models and their fields, blocks and query limits.",
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
      "Create an unpublished entry from a complete draft. Re-read after an uncertain outcome; creation is not idempotent.",
  },
  {
    name: "save_draft",
    operation: "save",
    description:
      "Replace the complete draft using the explicit expected revision. Does not publish or request a build.",
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
        if (!entry) return Promise.reject(new ArgumentFailure(transportError("NOT_FOUND").body));
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
      const handler = createMcpHandler(
        () => {
          const server = new McpServer({ name: "lace-content", version: input.version });
          for (const tool of tools) {
            if (!canContentOperation(actor, tool.operation)) continue;
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
                  const result = await execute(tool.name, raw, actor);
                  return {
                    content: [{ type: "text" as const, text: JSON.stringify(result) }],
                    structuredContent: result,
                  };
                } catch (error) {
                  outcome = "error";
                  const result =
                    error instanceof ArgumentFailure ? error.body : classifyError(error).body;
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
