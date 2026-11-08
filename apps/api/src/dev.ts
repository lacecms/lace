import { createNodeRuntime, parseNodeRuntimeSettings } from "@lacecms/platform-node";
import { startNodeServer } from "./server/node-server.js";
import { loadProjectConfig } from "./config/project-config.js";

async function main(): Promise<void> {
  const settings = parseNodeRuntimeSettings(process.env);
  const config = await loadProjectConfig();
  const runtime = createNodeRuntime({ config, settings });
  const server = await startNodeServer({ developmentGateway: true, runtime, settings });
  console.info(`Lace Node development server listening at ${server.url.href}`);
  const close = async () => {
    await server.close();
    runtime.close();
  };
  process.once("SIGINT", () => void close());
  process.once("SIGTERM", () => void close());
}

void main();
