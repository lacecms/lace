import { D1_MAX_BOUND_PARAMETERS } from "../d1/database.js";
import type { D1Database, D1PreparedStatement } from "../d1/database.js";
import { bind } from "./sql.js";

/** Every later statement of a guarded batch requires this batch-unique row. */
export const GUARD_SQL = "exists (select 1 from mutation_guards where token = ?)";
/** Raised by an injected checkpoint: a runtime `NOT NULL` failure inside the batch. */
const INJECTED_FAILURE_SQL = "insert into mutation_guards (token, created_at) values (null, 0)";

/** A SQL condition fragment with its positional parameters. */
export interface Condition {
  readonly params: readonly unknown[];
  readonly sql: string;
}

/** Builds one atomic `batch()` and records named checkpoint positions. */
export class MutationBatch {
  public readonly statements: D1PreparedStatement[] = [];

  public constructor(
    private readonly database: D1Database,
    private readonly hook: ((checkpoint: string) => void) | undefined,
  ) {}

  public add(sql: string, ...params: unknown[]): number {
    this.statements.push(bind(this.database.prepare(sql), params));
    return this.statements.length - 1;
  }

  public checkpoint(name: string): void {
    try {
      this.hook?.(name);
    } catch {
      this.add(INJECTED_FAILURE_SQL);
    }
  }
}

export function numberedValues(rows: number, width: number, offset: number): string {
  const tuples: string[] = [];
  for (let row = 0; row < rows; row += 1) {
    const values: string[] = [];
    for (let column = 0; column < width; column += 1) {
      values.push(`?${offset + row * width + column + 1}`);
    }
    tuples.push(`(${values.join(", ")})`);
  }
  return tuples.join(", ");
}

export function rowsPerStatement(shared: number, width: number): number {
  return Math.floor((D1_MAX_BOUND_PARAMETERS - shared) / width);
}
