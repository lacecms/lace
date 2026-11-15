/** A portable SQLite statement with positional bindings. */
export interface WritePlanSql {
  readonly sql: string;
  readonly params: readonly unknown[];
}

/** Condition applied to each mutation in a plan. */
export interface WritePlanGuard extends WritePlanSql {}

export interface WritePlanStatement extends WritePlanSql {
  readonly checkpoint?: string;
  readonly expectedChanges?: number;
  readonly outbox?: boolean;
  /** Read statements expose their rows under this name in the receipt. */
  readonly slot?: string;
}

/**
 * The admission predicate and diagnostic reads are evaluated in the atomic
 * unit. The statement factory must gate every write on the supplied condition.
 */
export interface WritePlan<Miss> {
  readonly admission: WritePlanSql;
  readonly diagnostics: Readonly<Record<string, WritePlanSql>>;
  readonly diagnose: (rows: Readonly<Record<string, readonly unknown[]>>) => Miss;
  readonly statements: (guard: WritePlanGuard) => readonly WritePlanStatement[];
}

export type WritePlanResult<Miss> =
  | { readonly kind: "rejected"; readonly reason: Miss; readonly committedOutboxWork: false }
  | {
      readonly kind: "committed";
      readonly committedOutboxWork: boolean;
      readonly changes: readonly number[];
      readonly slots: Readonly<Record<string, readonly unknown[]>>;
    };
