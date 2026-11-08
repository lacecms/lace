import { createNodeRuntime, parseNodeRuntimeSettings } from "@lacecms/platform-node";
import { startNodeServer } from "./server/node-server.js";
import { loadProjectConfig } from "./config/project-config.js";
import { createNodeAdminAssets } from "./server/admin-assets.js";

async function main(): Promise<void> {
  const settings = parseNodeRuntimeSettings(process.env);
  const config = await loadProjectConfig();
  const runtime = createNodeRuntime({
    adminAssets: createNodeAdminAssets(process.env.LACE_ADMIN_DIST ?? "/opt/lace/admin"),
    config,
    settings,
  });
  const server = await startNodeServer({
    dispatchMediaDeletions: false,
    runtime,
    settings,
  });
  console.info(`Lace production API listening at ${server.url.href}`);
  const close = async () => {
    await server.close();
    runtime.close();
  };
  process.once("SIGINT", () => void close());
  process.once("SIGTERM", () => void close());
}

void main();
