import { filesystemKind, MissingLedgerError } from "./diagnostics.js";
import type { D1Database, D1PreparedStatement, D1Result } from "@lacecms/platform-cloudflare";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { join } from "node:path";
import { CliError, EXIT } from "./index.js";

interface Query {
  readonly sql: string;
  readonly params: readonly unknown[];
}

interface ApiResult {
  readonly success?: boolean;
  readonly meta?: { readonly changes?: number };
  readonly results?: Record<string, unknown>[];
}

function toResult(value: ApiResult | undefined): D1Result {
  if (value?.success !== true || (value.results !== undefined && !Array.isArray(value.results)))
    throw new CliError(
      "OPERATION_FAILED",
      "Cloudflare D1 query failed.",
      EXIT.OPERATION,
      "d1-response",
    );
  return { meta: { changes: Number(value.meta?.changes ?? 0) }, results: value.results ?? [] };
}

class RemoteStatement implements D1PreparedStatement {
  public constructor(
    readonly query: Query,
    private readonly execute: (batch: readonly Query[]) => Promise<D1Result[]>,
  ) {}

  public bind(...values: unknown[]): D1PreparedStatement {
    return new RemoteStatement({ sql: this.query.sql, params: values }, this.execute);
  }

  public async all<Row = Record<string, unknown>>(): Promise<D1Result<Row>> {
    return (await this.execute([this.query]))[0] as D1Result<Row>;
  }

  public async first<Row = Record<string, unknown>>(): Promise<Row | null> {
    return (await this.all<Row>()).results[0] ?? null;
  }

  public async run(): Promise<D1Result> {
    return (await this.execute([this.query]))[0] as D1Result;
  }
}

/** A single REST batch maps to a single D1 transaction. No provider body enters errors. */
export class RemoteD1Database implements D1Database {
  public constructor(
    private readonly settings: {
      readonly accountId: string;
      readonly databaseId: string;
      readonly apiToken: string;
    },
    private readonly request: typeof fetch = fetch,
  ) {}

  public prepare(sql: string): D1PreparedStatement {
    return new RemoteStatement({ sql, params: [] }, (queries) => this.execute(queries));
  }

  public async batch(statements: D1PreparedStatement[]): Promise<D1Result[]> {
    if (!statements.every((statement) => statement instanceof RemoteStatement))
      throw new CliError(
        "OPERATION_FAILED",
        "D1 batch contains an incompatible statement.",
        EXIT.OPERATION,
      );
    return this.execute(statements.map((statement) => (statement as RemoteStatement).query));
  }

  private async execute(queries: readonly Query[]): Promise<D1Result[]> {
    const { accountId, databaseId, apiToken } = this.settings;
    const url = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/d1/database/${encodeURIComponent(databaseId)}/query`;
    let response: Response;
    try {
      response = await this.request(url, {
        method: "POST",
        headers: { authorization: `Bearer ${apiToken}`, "content-type": "application/json" },
        body: JSON.stringify({ batch: queries }),
      });
    } catch {
      throw new CliError(
        "OPERATION_FAILED",
        "Cloudflare D1 is unavailable.",
        EXIT.OPERATION,
        "d1-unavailable",
      );
    }
    const failed = (kind: "d1-auth" | "d1-unavailable" | "d1-response") =>
      new CliError(
        "OPERATION_FAILED",
        `Cloudflare D1 request failed (HTTP ${response.status}).`,
        EXIT.OPERATION,
        kind,
      );
    // A rejected query (4xx) differs from an unreachable or throttled provider.
    const rejected = () =>
      response.status < 500 && response.status !== 429 ? "d1-response" : "d1-unavailable";
    if (response.status === 401 || response.status === 403) {
      await response.body?.cancel();
      throw failed("d1-auth");
    }
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      if (!response.ok) throw failed(rejected());
      throw new CliError(
        "OPERATION_FAILED",
        "Cloudflare D1 returned an invalid response.",
        EXIT.OPERATION,
        "d1-response",
      );
    }
    // Inspect only a missing-ledger signature; never return provider text. D1
    // reports SQL errors such as a missing ledger with HTTP 400.
    const errors = (payload as { errors?: { message?: unknown }[] } | null)?.errors;
    if (
      Array.isArray(errors) &&
      queries.every((query) => query.sql === "select name from d1_migrations") &&
      errors.some(
        (error) =>
          typeof error?.message === "string" &&
          /\bno such table: (?:main\.)?d1_migrations\b/u.test(error.message),
      )
    )
      throw new MissingLedgerError();
    if (!response.ok) throw failed(rejected());
    if (
      payload === null ||
      typeof payload !== "object" ||
      !("success" in payload) ||
      (payload as { success: unknown }).success !== true
    )
      throw new CliError(
        "OPERATION_FAILED",
        "Cloudflare D1 query failed.",
        EXIT.OPERATION,
        "d1-response",
      );
    const results = (payload as { result?: ApiResult[] }).result;
    if (!Array.isArray(results) || results.length !== queries.length)
      throw new CliError(
        "OPERATION_FAILED",
        "Cloudflare D1 returned an incomplete batch.",
        EXIT.OPERATION,
        "d1-response",
      );
    return results.map(toResult);
  }
}

/** Opens the same persisted D1 state Wrangler uses for local development. */
export async function openLocalD1(input: {
  readonly databaseId: string;
  readonly persistTo: string;
}): Promise<{
  readonly database: D1Database;
  readonly close: () => Promise<void>;
}> {
  const miniflare = new Miniflare(
    convertV4MiniflareOptions({
      compatibilityDate: "2026-09-01",
      d1Databases: { DB: input.databaseId },
      modules: true,
      resourcePersistencePath: join(input.persistTo, "v3"),
      script: "export default { fetch() { return new Response(null, { status: 404 }); } };",
    }),
  );
  try {
    const database = (await miniflare.getD1Database("DB")) as D1Database;
    return { database, close: () => miniflare.dispose() };
  } catch (error) {
    await miniflare.dispose();
    if (filesystemKind(error)) throw error;
    throw new CliError(
      "OPERATION_FAILED",
      "Local Cloudflare D1 state is unavailable.",
      EXIT.OPERATION,
      "d1-unavailable",
    );
  }
}
