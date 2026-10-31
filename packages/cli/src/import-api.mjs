// In-process Node API for lace import tests: migrated SQLite, synchronized
// fixture configuration, an administrator and a real import token.
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createNodeRuntime,
  migrateNodeDatabase,
  parseNodeRuntimeSettings,
  runLocalContentSync,
  SystemNodeClock,
  UlidGenerator,
} from "@lacecms/platform-node";
import { InMemoryObjectStorage } from "@lacecms/test-utils";

export const ORIGIN = "https://lace.test";
const ADMIN = { id: "import-admin", role: "admin" };

/** Opens an API whose session requests act as the administrator. */
export async function openImportApi(config, { publish = true } = {}) {
  const directory = await mkdtemp(join(tmpdir(), "lace-import-api-"));
  const databasePath = join(directory, "lace.sqlite");
  migrateNodeDatabase(databasePath);
  const runtime = createNodeRuntime({
    config,
    actors: { resolve: async () => ADMIN },
    imageInspector: { inspect: async () => ({ height: 2, width: 3 }) },
    logger: { log() {} },
    rateLimiter: { check: async () => true },
    storage: new InMemoryObjectStorage(),
    settings: parseNodeRuntimeSettings({
      LACE_AUTH_SECRET: "import-test-secret-at-least-32-characters",
      LACE_DATABASE_PATH: databasePath,
      LACE_PUBLIC_BASE_URL: `${ORIGIN}/`,
      LACE_MINIO_ACCESS_KEY: "test",
      LACE_MINIO_SECRET_KEY: "test",
      LACE_MINIO_TIMEOUT_MS: "1000",
      LACE_MINIO_BUCKET: "test",
      LACE_MINIO_ENDPOINT: "http://localhost:9000",
      LACE_MINIO_REGION: "test",
    }),
  });
  runtime.database.connection
    .prepare(
      "insert into user (id, name, email, email_verified, role, disabled, created_at, updated_at) values (?, 'Importer', 'importer@lace.test', 1, 'admin', 0, 1, 1)",
    )
    .run(ADMIN.id);
  const synced = await runLocalContentSync({
    blocks: config.runtime.blocks,
    check: false,
    clock: new SystemNodeClock(),
    ids: new UlidGenerator(),
    models: config.runtime.content,
    target: runtime.repository,
    write: () => {},
  });
  if (synced !== 0) throw new Error("fixture content sync failed");
  const now = Date.now();
  const issued = await runtime.security.createImportToken({
    capabilities: publish ? ["content:import", "content:publish"] : ["content:import"],
    createdBy: ADMIN.id,
    expiresAt: now + 86_400_000,
    name: "Import test",
    now,
  });
  const requests = [];
  let failAfter;
  const fetch = async (url, init = {}) => {
    const path = new URL(url).pathname;
    requests.push(`${init.method ?? "GET"} ${path}`);
    if (failAfter !== undefined && failAfter(`${init.method ?? "GET"} ${path}`, requests))
      throw new Error("simulated network failure");
    return runtime.app.fetch(new Request(url, init));
  };
  /** A browser-session request by the administrator (an editor's change). */
  const session = async (path, { method = "GET", json } = {}) => {
    const response = await runtime.app.fetch(
      new Request(`${ORIGIN}${path}`, {
        method,
        headers: {
          origin: ORIGIN,
          ...(json === undefined ? {} : { "content-type": "application/json" }),
        },
        ...(json === undefined ? {} : { body: JSON.stringify(json) }),
      }),
    );
    return { status: response.status, body: await response.json() };
  };
  return {
    origin: ORIGIN,
    token: issued.token,
    fetch,
    requests,
    session,
    runtime,
    failWhen(predicate) {
      failAfter = predicate;
    },
    async close() {
      runtime.close();
      await rm(directory, { recursive: true, force: true });
    },
  };
}
