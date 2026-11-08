// Directory dependencies: config; dispatch; server.
export const packageName = "@lacecms/app-api";

export * from "./server/node-server.js";
export type { NodeApiConfig } from "./config/project-config.js";
