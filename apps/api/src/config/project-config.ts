import type { CreateNodeRuntimeInput } from "@lacecms/platform-node";

export type NodeApiConfig = CreateNodeRuntimeInput["config"];

const projectConfigUrl = new URL("../../../../lace.config.ts", import.meta.url);

function isNormalizedConfig(value: unknown): value is NodeApiConfig {
  if (value === null || typeof value !== "object") return false;
  const config = value as Record<string, unknown>;
  return (
    Array.isArray(config.content) &&
    typeof config.structureHash === "string" &&
    typeof config.projectionHash === "string" &&
    config.public !== null &&
    typeof config.public === "object" &&
    config.runtime !== null &&
    typeof config.runtime === "object"
  );
}

/** Loads the one code-owned configuration before the development listener binds. */
export async function loadProjectConfig(
  importer: () => Promise<unknown> = () => import(projectConfigUrl.href),
): Promise<NodeApiConfig> {
  let module: unknown;
  try {
    module = await importer();
  } catch (error) {
    if (error instanceof Error && error.name === "ConfigurationError") {
      throw new Error(`Invalid lace.config.ts: ${error.message}`);
    }
    throw new Error(
      "Could not load lace.config.ts. Check that the root file exists and evaluates.",
    );
  }
  const config =
    module !== null && typeof module === "object" && "default" in module
      ? module.default
      : undefined;
  if (!isNormalizedConfig(config)) {
    throw new Error("Invalid lace.config.ts: default export must be a normalized configuration.");
  }
  return config;
}
