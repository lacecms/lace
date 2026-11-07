import { defineConfig } from "drizzle-kit";

// Table modules in the order their first table appeared in the former single
// schema file; `columns.ts` and `better-auth.ts` define no tables.
const tableModules = [
  "content",
  "publication",
  "media",
  "links",
  "outbox",
  "builds",
  "operations",
  "security",
  "auth",
  "oauth",
];

export default defineConfig({
  dialect: "sqlite",
  out: "./packages/db/drizzle",
  schema: tableModules.map((module) => `./packages/db/src/schema/${module}.ts`),
  strict: true,
});
