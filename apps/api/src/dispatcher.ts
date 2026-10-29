import { createNodeRuntime, parseNodeRuntimeSettings } from "@lacecms/platform-node";
import { startDispatchLoop } from "./dispatcher-loop.js";
import { loadProjectConfig } from "./project-config.js";

async function main(): Promise<void> {
  const settings = parseNodeRuntimeSettings(process.env);
  const config = await loadProjectConfig();
  const runtime = createNodeRuntime({ config, settings });
  await runtime.maintainOAuth();
  await runtime.verifyStorage();
  const loop = startDispatchLoop({
    build: () => runtime.buildDispatcher.runOnce(),
    media: async () => {
      await runtime.maintainOAuth();
      await runtime.deletionDispatcher.runOnce();
    },
    onError: () => console.error("Lace dispatch cycle failed."),
  });
  const close = async () => {
    await loop.close();
    runtime.close();
  };
  process.once("SIGINT", () => void close());
  process.once("SIGTERM", () => void close());
}

void main();
