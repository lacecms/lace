import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { onTestFinished } from "vitest";
import { actorId, unixMilliseconds } from "@lacecms/domain";
import type { Actor } from "@lacecms/domain";
import type { ActorResolver } from "@lacecms/server";
import type * as NodePlatform from "../index.js";

/** Available only to Vitest fixtures; production entries never import this module. */
export function createTestActorResolver(actor: Actor): ActorResolver {
  if (!process.argv.some((argument) => argument.includes("vitest"))) {
    throw new Error("Test actor resolver is available only in the Vitest runtime.");
  }
  return Object.freeze({ resolve: async (): Promise<Actor> => actor });
}

/** MinIO settings a Node runtime parses; tests never reach the endpoint. */
export const minioTestEnvironment: Readonly<Record<string, string>> = Object.freeze({
  LACE_MINIO_ACCESS_KEY: "test-access-key",
  LACE_MINIO_BUCKET: "lace-media",
  LACE_MINIO_ENDPOINT: "http://minio.test:9000",
  LACE_MINIO_REGION: "us-east-1",
  LACE_MINIO_SECRET_KEY: "test-secret-key",
  LACE_MINIO_TIMEOUT_MS: "1000",
});

/** The platform entry a test opens: source (`../index.js`) or compiled (`../dist/index.js`). */
export type NodeTestPlatform = Pick<
  typeof NodePlatform,
  "createNodeRuntime" | "migrateNodeDatabase" | "parseNodeRuntimeSettings" | "runLocalContentSync"
>;

type RuntimeInput = Parameters<NodeTestPlatform["createNodeRuntime"]>[0];
type NodeRuntime = ReturnType<NodeTestPlatform["createNodeRuntime"]>;
type NodeRuntimeSettings = ReturnType<NodeTestPlatform["parseNodeRuntimeSettings"]>;
type RuntimeConfig = RuntimeInput["config"];

export interface NodeTestRuntimeOptions {
  readonly config: RuntimeConfig;
  /** Resolved for every request; `null` keeps the runtime's anonymous resolver. */
  readonly actor?: Actor | null;
  /** An explicit resolver; wins over `actor`. */
  readonly actors?: ActorResolver;
  readonly storage?: NonNullable<RuntimeInput["storage"]>;
  /** Runs local content sync for `config` and fails unless it reports success. */
  readonly sync?: boolean;
  /** Extra or replaced environment values for `parseNodeRuntimeSettings`. */
  readonly settings?: Readonly<Record<string, string>>;
  /**
   * Keeps the runtime's own logger and rate limiter. By default the harness
   * silences logging and allows every request.
   */
  readonly runtimeDefaults?: boolean;
}

export interface NodeTestRuntime {
  /** The open runtime; `reopen` replaces it. */
  readonly runtime: NodeRuntime;
  readonly directory: string;
  readonly settings: NodeRuntimeSettings;
  /** Calls the app at `https://lace.test` with a same-origin JSON request. */
  request(path: string, init?: RequestInit): Promise<Response>;
  /** Runs local content sync for `config` (the open configuration by default). */
  sync(config?: RuntimeConfig): Promise<number>;
  /** Closes the runtime and opens the same database with `config`. */
  reopen(config: RuntimeConfig): NodeRuntime;
  /** Closes the runtime and removes the directory; safe to call twice. */
  close(): Promise<void>;
}

const testAdmin: Actor = Object.freeze({ id: actorId("test-admin"), role: "admin" });

/** Opens a migrated Node runtime in a temporary directory, closed when the test finishes. */
export async function openNodeTestRuntime(
  platform: NodeTestPlatform,
  options: NodeTestRuntimeOptions,
): Promise<NodeTestRuntime> {
  const directory = await mkdtemp(join(tmpdir(), "lace-node-test-"));
  const databasePath = join(directory, "lace.sqlite");
  platform.migrateNodeDatabase(databasePath);
  const settings = platform.parseNodeRuntimeSettings({
    ...minioTestEnvironment,
    LACE_AUTH_SECRET: "node-test-runtime-secret-at-least-32-characters",
    LACE_DATABASE_PATH: databasePath,
    LACE_PUBLIC_BASE_URL: "https://lace.test/",
    ...options.settings,
  });
  const actor = options.actor === undefined ? testAdmin : options.actor;
  const actors = options.actors ?? (actor === null ? undefined : createTestActorResolver(actor));
  const open = (config: RuntimeConfig): NodeRuntime =>
    platform.createNodeRuntime({
      config,
      settings,
      ...(actors === undefined ? {} : { actors }),
      ...(options.storage === undefined ? {} : { storage: options.storage }),
      ...(options.runtimeDefaults === true
        ? {}
        : {
            logger: { log: () => undefined },
            rateLimiter: { check: async () => true },
          }),
    });
  let config = options.config;
  let runtime = open(config);
  let closed = false;
  let syncId = 0;
  const harness: NodeTestRuntime = {
    get runtime() {
      return runtime;
    },
    directory,
    settings,
    request: async (path, init = {}) =>
      runtime.app.fetch(
        new Request(`https://lace.test${path}`, {
          ...init,
          headers: {
            origin: "https://lace.test",
            "content-type": "application/json",
            ...Object.fromEntries(new Headers(init.headers)),
          },
        }),
      ),
    sync: (target = config) =>
      platform.runLocalContentSync({
        check: false,
        clock: { now: () => unixMilliseconds(Date.now()) },
        ids: { next: () => `node-test-sync-${++syncId}` },
        models: target.runtime.content,
        blocks: target.runtime.blocks,
        target: runtime.repository,
        write: () => undefined,
      }),
    reopen(next) {
      runtime.close();
      config = next;
      runtime = open(next);
      return runtime;
    },
    async close() {
      if (closed) return;
      closed = true;
      runtime.close();
      await rm(directory, { force: true, recursive: true });
    },
  };
  onTestFinished(() => harness.close());
  if (options.sync === true) {
    const code = await harness.sync();
    if (code !== 0) throw new Error(`Local content sync failed with exit code ${code}.`);
  }
  return harness;
}
