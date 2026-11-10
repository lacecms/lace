import { OAuthConnectionUseCases } from "@lacecms/application";

/** Documentation generation never invokes the connection storage. */
export function openApiConnections(): OAuthConnectionUseCases {
  const unavailable = () => {
    throw new Error("OpenAPI generation cannot access MCP connections");
  };
  return new OAuthConnectionUseCases({
    clock: { now: unavailable },
    connections: {
      listConnections: unavailable,
      revokeConnection: unavailable,
      invalidateUser: unavailable,
    },
  });
}
