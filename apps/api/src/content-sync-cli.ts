import { access } from "node:fs/promises";
import {
  NodeContentRepository,
  SystemNodeClock,
  UlidGenerator,
  openNodeDatabase,
  runLocalContentSync,
} from "@lacecms/platform-node";
import { loadProjectConfig } from "./project-config.js";

async function main(): Promise<number> {
  const args = process.argv.slice(2);
  if (args.length > 1 || (args.length === 1 && args[0] !== "--check")) {
    throw new Error("Usage: pnpm content:sync [--check]");
  }
  const databasePath = process.env.LACE_DATABASE_PATH;
  if (databasePath === undefined || databasePath.trim() === "") {
    throw new Error("Missing LACE_DATABASE_PATH. Start the local stack with pnpm dev:node.");
  }
  try {
    await access(databasePath);
  } catch {
    throw new Error(
      "Local SQLite database is missing. Start the migrated stack with pnpm dev:node.",
    );
  }
  const config = await loadProjectConfig();
  const database = openNodeDatabase(databasePath);
  try {
    const repository = new NodeContentRepository(database.connection, () => undefined);
    return await runLocalContentSync({
      check: args[0] === "--check",
      clock: new SystemNodeClock(),
      ids: new UlidGenerator(),
      blocks: config.runtime.blocks,
      models: config.runtime.content,
      target: repository,
      write: (message) => console.info(message),
    });
  } finally {
    database.connection.close();
  }
}

void main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "Local synchronization failed.");
    process.exitCode = 1;
  });
