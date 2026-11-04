import type { KVNamespace } from "./cache.js";
import type { D1Database } from "./d1.js";
import type { R2Bucket } from "./r2-storage.js";

/** Checked-in forward migrations split into D1-executable statements. */
export function migrationStatements(include?: (file: string) => boolean): Promise<string[]>;

export interface LocalCloudflare {
  readonly bucket: R2Bucket;
  readonly database: D1Database;
  readonly dispose: () => Promise<void>;
  readonly kv: KVNamespace;
}

/** Starts isolated in-memory local D1 (migrated), R2, and KV bindings. */
export function openLocalCloudflare(options?: {
  readonly migrate?: boolean;
  readonly persistTo?: string;
}): Promise<LocalCloudflare>;

/** Starts an isolated in-memory local D1 database with every migration applied. */
export function openLocalD1(): Promise<Pick<LocalCloudflare, "database" | "dispose">>;

export interface D1Counts {
  batches: number;
  maxParameters: number;
  maxBatchStatements: number;
  queries: number;
  rowsRead: number;
  rowsWritten: number;
}

/** Counts queries and bound parameters issued through a D1 binding. */
export function countingD1(database: D1Database): { binding: D1Database; stats: D1Counts };
