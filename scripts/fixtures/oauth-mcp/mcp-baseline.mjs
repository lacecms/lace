// Portable compatibility probe, not the production content adapter.
import { McpServer, createMcpHandler, fromJsonSchema } from "@modelcontextprotocol/server";
import * as v from "valibot";
import { toJsonSchema } from "@valibot/to-json-schema";
export function probeHandler() {
  const schema = v.strictObject({ value: v.string() });
  return createMcpHandler(
    () => {
      const server = new McpServer({ name: "lace-compatibility-fixture", version: "0.0.0" });
      server.registerTool(
        "probe",
        { inputSchema: fromJsonSchema(toJsonSchema(schema)) },
        async (input) => {
          const result = v.parse(schema, input);
          return {
            content: [{ type: "text", text: JSON.stringify(result) }],
            structuredContent: result,
          };
        },
      );
      return server;
    },
    { legacy: "stateless" },
  );
}
