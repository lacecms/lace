/**
 * Structural subset of the Cloudflare D1 binding used by Lace. The Worker
 * runtime binding and Miniflare's local proxy both satisfy it.
 */
export interface D1Result<Row = Record<string, unknown>> {
  readonly meta: { readonly changes: number };
  readonly results: Row[];
}

export interface D1PreparedStatement {
  all<Row = Record<string, unknown>>(): Promise<D1Result<Row>>;
  bind(...values: unknown[]): D1PreparedStatement;
  first<Row = Record<string, unknown>>(): Promise<Row | null>;
  run(): Promise<D1Result>;
}

export interface D1Database {
  batch(statements: D1PreparedStatement[]): Promise<D1Result[]>;
  prepare(query: string): D1PreparedStatement;
}

/** D1 rejects statements binding more than 100 parameters. */
export const D1_MAX_BOUND_PARAMETERS = 100;
/** Free-plan per-invocation query ceiling; each batch statement counts. */
export const D1_QUERY_BUDGET = 50;
/** Leaves room inside {@link D1_QUERY_BUDGET} for a mutation's reads. */
export const D1_MAX_BATCH_STATEMENTS = 40;
/** Claims per call, each needing up to two batch statements. */
export const D1_MAX_CLAIMS_PER_CALL = 20;
