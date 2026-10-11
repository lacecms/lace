import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { D1ContentRepository, D1SecurityService } from "@lacecms/platform-cloudflare";
import { SystemNodeClock, UlidGenerator, runLocalContentSync } from "@lacecms/platform-node";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { loadProjectConfig } from "./project-config.js";

const usage = "Usage: node apps/api/dist/cloudflare-local.js prepare --persist-to <dir>";
const configPath = join(import.meta.dirname, "..", "wrangler.jsonc");

/** Reads the D1 database ID Wrangler keys local state by. */
async function localDatabaseId(): Promise<string> {
  const text = await readFile(configPath, "utf8");
  const config = JSON.parse(
    text
      .split("\n")
      .filter((line) => !line.trim().startsWith("//"))
      .join("\n")
      .replace(/,(\s*[}\]])/gu, "$1"),
  ) as { readonly d1_databases?: readonly { binding: string; database_id?: string }[] };
  const id = config.d1_databases?.find((database) => database.binding === "DB")?.database_id;
  if (id === undefined) throw new Error("apps/api/wrangler.jsonc declares no DB D1 database.");
  return id;
}

/**
 * Local-only development preparation: synchronizes the project configuration
 * into the persisted Wrangler D1 state and mints a setup token while setup is
 * open. It must run while no `wrangler dev` process holds the same state.
 */
async function prepare(persistTo: string): Promise<number> {
  const miniflare = new Miniflare(
    convertV4MiniflareOptions({
      compatibilityDate: "2026-09-01",
      d1Databases: { DB: await localDatabaseId() },
      modules: true,
      resourcePersistencePath: join(persistTo, "v3"),
      script: "export default { fetch() { return new Response(null, { status: 404 }); } };",
    }),
  );
  try {
    const database = (await miniflare.getD1Database("DB")) as never;
    const clock = new SystemNodeClock();
    const config = await loadProjectConfig();
    const synced = await runLocalContentSync({
      check: false,
      clock,
      ids: new UlidGenerator(),
      blocks: config.runtime.blocks,
      models: config.runtime.content,
      target: new D1ContentRepository(database, () => undefined),
      write: (message) => console.info(message),
    });
    if (synced !== 0) return synced;
    const security = new D1SecurityService(database, () => clock.now());
    try {
      const setup = await security.createSetupToken();
      console.info(
        `First-admin setup token (shown once; expires ${new Date(Number(setup.expiresAt)).toISOString()}):`,
      );
      console.info(setup.token);
    } catch (error) {
      if (!(error instanceof Error) || error.message !== "Setup already completed.") throw error;
      console.info("First-admin setup is complete.");
    }
    return 0;
  } finally {
    await miniflare.dispose();
  }
}

async function main(): Promise<number> {
  const [command, flag, persistTo, ...rest] = process.argv.slice(2);
  if (command !== "prepare" || flag !== "--persist-to" || !persistTo || rest.length > 0)
    throw new Error(usage);
  return prepare(persistTo);
}

void main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "Local Cloudflare preparation failed.");
    process.exitCode = 1;
  });
