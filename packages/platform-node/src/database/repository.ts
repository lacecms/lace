import { NodeContentRepository } from "@lacecms/db/node";
import type { ContentModelResolver, NodeRepositoryOptions } from "@lacecms/db/node";
import type { NodeDatabase } from "./connection.js";

export function nodeContentRepository(
  database: NodeDatabase,
  resolveModel: ContentModelResolver,
  options?: NodeRepositoryOptions,
): NodeContentRepository {
  return new NodeContentRepository(database.connection, resolveModel, options);
}
