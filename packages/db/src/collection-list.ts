import { CollectionQueryValidationError, validateListQueryBudget } from "@lacecms/application";
import type {
  CollectionQueryField,
  ContentEntryListPage,
  ListContentEntriesInput,
} from "@lacecms/application";
import { sha256CanonicalJson } from "@lacecms/content";
import { opaqueCursor } from "@lacecms/application";
import {
  assertPageSize,
  decodeBase64Url,
  decodeEntryCursor,
  encodeBase64Url,
  encodeSortCursor,
  entryCursorKind,
  entrySummary,
  entryTotals,
  ENTRY_SOURCE_SQL,
  ENTRY_STATUS_SQL,
  ENTRY_SORT_SQL,
} from "./sql-content.js";
import type { SummaryRow, TotalsRow } from "./sql-content.js";
import { literalLikePattern } from "./literal-like.js";

type Parameter = number | string | null;
interface Statement {
  readonly sql: string;
  readonly params: readonly Parameter[];
}
interface FieldCursor {
  readonly version: 3;
  readonly kind: string;
  readonly type: string;
  readonly id: string;
  readonly rank: 0 | 1;
  readonly value?: number | string | boolean | null;
  readonly snapshot?: string;
  readonly revision?: number;
  readonly boundary?: "string-anchor";
}
export interface CollectionListRow extends Omit<SummaryRow, "sort_value"> {
  readonly sort_value: number | string | null;
  readonly sort_missing: 0 | 1;
  readonly draft_snapshot_id: string;
  readonly anchor_valid?: number;
}
const invalidCursor = (): never => {
  throw new CollectionQueryValidationError("/after");
};
const id = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0 && value.length <= 255;
const strings = new Set(["text", "textarea", "select", "url"]);
class Bindings {
  public readonly params: Parameter[] = [];
  private readonly paths = new Map<string, string>();
  public add(value: Parameter): string {
    this.params.push(value);
    return `?${this.params.length}`;
  }
  public path(key: string): string {
    if (!/^[A-Za-z][A-Za-z0-9]*$/u.test(key)) throw new CollectionQueryValidationError("/sort");
    const old = this.paths.get(key);
    if (old) return old;
    const parameter = this.add(`$.${key}`);
    this.paths.set(key, parameter);
    return parameter;
  }
}
function scalar(field: CollectionQueryField, bind: Bindings): { value: string; present: string } {
  const path = bind.path(field.key),
    raw = `json_extract(d.fields_json, ${path})`,
    type = `json_type(d.fields_json, ${path})`;
  if (field.type === "number")
    return {
      value: raw,
      present: `coalesce(${type} in ('integer','real') and abs(${raw}) <= 1.7976931348623157e308,0)`,
    };
  if (field.type === "boolean")
    return { value: raw, present: `coalesce(${type} in ('true','false'),0)` };
  if (field.type === "datetime") {
    const value = `cast(round((julianday(${raw})-2440587.5)*86400000) as integer)`;
    return { value, present: `coalesce(${type}='text' and ${raw}<>'' and ${value} is not null,0)` };
  }
  return { value: raw, present: `coalesce(${type}='text' and ${raw}<>'',0)` };
}
function predicates(input: ListContentEntriesInput, bind: Bindings): string {
  const clauses = [`e.model_key = ${bind.add(input.modelKey)}`];
  if (input.q !== undefined) {
    const pattern = bind.add(literalLikePattern(input.q));
    const search = [
      `d.title like ${pattern} escape '\\'`,
      `coalesce(d.slug,'') like ${pattern} escape '\\'`,
    ];
    for (const field of input.query?.searchableFields ?? []) {
      const target = scalar(field, bind);
      search.push(`(${target.present} and ${target.value} like ${pattern} escape '\\')`);
    }
    clauses.push(`(${search.join(" or ")})`);
  }
  for (const filter of input.query?.filters ?? []) {
    const field = input.query!.filterableFields.find((candidate) => candidate.key === filter.field);
    if (!field) throw new CollectionQueryValidationError("/filters");
    const target = scalar(field, bind);
    if (filter.op === "isSet") clauses.push(target.present);
    else if (filter.op === "isNotSet") clauses.push(`not (${target.present})`);
    else {
      const conditions = [target.present];
      if (filter.op === "eq" || filter.op === "contains") {
        if (typeof filter.value === "string")
          conditions.push(
            filter.op === "contains"
              ? `${target.value} like ${bind.add(literalLikePattern(filter.value))} escape '\\'`
              : `${target.value} = ${bind.add(filter.value)} collate nocase`,
          );
        else
          conditions.push(
            `${target.value} = ${bind.add(typeof filter.value === "boolean" ? Number(filter.value) : filter.value)}`,
          );
      } else if (filter.op === "in")
        conditions.push(
          `${target.value} in (select value from json_each(${bind.add(JSON.stringify(filter.values))}))`,
        );
      else if (filter.op === "range") {
        const lower = filter.min ?? filter.from,
          upper = filter.max ?? filter.to;
        const operand = (value: number | string): Parameter =>
          field.type === "datetime" ? Date.parse(value as string) : value;
        if (lower !== undefined) conditions.push(`${target.value} >= ${bind.add(operand(lower))}`);
        if (upper !== undefined) conditions.push(`${target.value} <= ${bind.add(operand(upper))}`);
      }
      clauses.push(`(${conditions.join(" and ")})`);
    }
  }
  return clauses.join(" and ");
}
function decodeFieldCursor(
  input: ListContentEntriesInput,
  kind: string,
  field: CollectionQueryField,
): FieldCursor | undefined {
  if (input.after === undefined) return undefined;
  try {
    if (input.after.length > 4096 || !/^[A-Za-z0-9_-]+$/u.test(input.after)) return invalidCursor();
    const cursor = JSON.parse(decodeBase64Url(input.after)) as FieldCursor;
    if (
      !cursor ||
      cursor.version !== 3 ||
      cursor.kind !== kind ||
      cursor.type !== field.type ||
      !id(cursor.id) ||
      (cursor.rank !== 0 && cursor.rank !== 1)
    )
      return invalidCursor();
    const allowed = strings.has(field.type)
      ? ["version", "kind", "type", "id", "rank", "snapshot", "revision", "boundary"]
      : ["version", "kind", "type", "id", "rank", "value"];
    if (
      Object.keys(cursor).length !== allowed.length ||
      Object.keys(cursor).some((key) => !allowed.includes(key))
    )
      return invalidCursor();
    if (strings.has(field.type)) {
      if (
        cursor.boundary !== "string-anchor" ||
        !id(cursor.snapshot) ||
        !Number.isSafeInteger(cursor.revision) ||
        cursor.revision! < 1
      )
        return invalidCursor();
    } else if (cursor.rank === 1) {
      if (cursor.value !== null) return invalidCursor();
    } else if (field.type === "date") {
      if (
        typeof cursor.value !== "string" ||
        !/^\d{4}-\d{2}-\d{2}$/u.test(cursor.value) ||
        !Number.isFinite(Date.parse(`${cursor.value}T00:00:00Z`)) ||
        new Date(`${cursor.value}T00:00:00Z`).toISOString().slice(0, 10) !== cursor.value
      )
        return invalidCursor();
    } else if (field.type === "boolean") {
      if (typeof cursor.value !== "boolean") return invalidCursor();
    } else if (
      typeof cursor.value !== "number" ||
      !Number.isFinite(cursor.value) ||
      (field.type === "datetime" && !Number.isSafeInteger(cursor.value))
    )
      return invalidCursor();
    return cursor;
  } catch {
    return invalidCursor();
  }
}

/** Shared, prepared list statements. String anchors are resolved and guarded in the item read itself. */
export async function collectionListPlan(input: ListContentEntriesInput): Promise<{
  readonly items: Statement;
  readonly totals: Statement;
  page(rows: readonly CollectionListRow[], totals: TotalsRow): ContentEntryListPage;
}> {
  const { q: rawQ, ...rest } = input;
  const q = rawQ?.trim();
  input = { ...rest, ...(q ? { q } : {}) };
  validateListQueryBudget(input.q, input.query?.filters ?? [], input.listQueryLimits);
  const limit = assertPageSize(input.limit),
    descending = input.sort.startsWith("-"),
    direction = descending ? "desc" : "asc",
    comparison = descending ? "<" : ">";
  const sortKey = descending ? input.sort.slice(1) : input.sort;
  const custom = sortKey.startsWith("field:");
  const field = custom
    ? input.query?.sortableFields.find((candidate) => candidate.key === sortKey.slice(6))
    : undefined;
  if (custom && field === undefined) throw new CollectionQueryValidationError("/sort");
  const system = custom ? undefined : ENTRY_SORT_SQL[sortKey];
  if (!custom && system === undefined) throw new CollectionQueryValidationError("/sort");
  if (input.status !== undefined && !["draft", "published", "changed"].includes(input.status))
    throw new CollectionQueryValidationError("/status");
  const oldKind = await entryCursorKind(input);
  const kind = custom ? await sha256CanonicalJson(oldKind) : oldKind;
  const after = field ? decodeFieldCursor(input, kind, field) : undefined;
  let systemAfter: ReturnType<typeof decodeEntryCursor> | undefined;
  if (!custom && input.after !== undefined) {
    try {
      systemAfter = decodeEntryCursor(input.after, kind, input.sort);
    } catch {
      invalidCursor();
    }
  }
  const bind = new Bindings();
  const where = [predicates(input, bind)];
  if (input.status !== undefined) where.push(`${ENTRY_STATUS_SQL} = ${bind.add(input.status)}`);
  const target = field ? scalar(field, bind) : undefined;
  const value = target
    ? `(case when ${target.present} then ${target.value} else null end)`
    : system!.value;
  const order = target
    ? `${value}${strings.has(field!.type) ? " collate nocase" : ""}`
    : system!.order;
  const rank = target ? `(case when ${target.present} then 0 else 1 end)` : "0";
  const listJson =
    input.listFields.length === 0
      ? "'{}'"
      : `(select json_group_object(value, json(d.fields_json -> ('$.' || value))) from json_each(${bind.add(JSON.stringify(input.listFields))}))`;
  const fields = `e.id, e.model_key, e.published_snapshot_id, e.updated_at, d.id as draft_snapshot_id,
    d.revision as draft_revision, d.title, d.slug, ${listJson} as fields_json, d.updated_by,
    u.name as updated_by_name, p.created_at as published_at, ${ENTRY_STATUS_SQL} as status`;
  let anchor = "",
    anchorRank = "",
    anchorValue = "",
    anchorId = "",
    valid = "1";
  const anchored = after !== undefined && strings.has(field!.type);
  if (anchored) {
    anchor = `with anchor as materialized (select ${value} as value, ${rank} as rank from content_entries e join content_snapshots d on d.id=e.draft_snapshot_id
      where e.model_key=${bind.add(input.modelKey)} and e.id=${bind.add(after.id)} and d.id=${bind.add(after.snapshot!)} and d.revision=${bind.add(after.revision!)}) `;
    anchorRank = "(select rank from anchor)";
    anchorValue = "(select value from anchor) collate nocase";
    anchorId = bind.add(after.id);
    valid = `exists(select 1 from anchor where rank=${bind.add(after.rank)})`;
  } else if (after) {
    anchorRank = bind.add(after.rank);
    anchorValue = bind.add(typeof after.value === "boolean" ? Number(after.value) : after.value!);
    anchorId = bind.add(after.id);
  }
  if (after)
    where.push(`(${rank} > ${anchorRank} or (${rank} = ${anchorRank} and
    ((${rank}=1 and e.id ${comparison} ${anchorId}) or (${rank}=0 and (${order} ${comparison} ${anchorValue} or (${order} = ${anchorValue} and e.id ${comparison} ${anchorId}))))))`);
  else if (systemAfter) {
    const boundary = bind.add(systemAfter.value);
    where.push(
      `(${order} ${comparison} ${boundary} or (${order} = ${boundary} and e.id ${comparison} ${bind.add(systemAfter.id)}))`,
    );
  }
  const stringSort = field !== undefined && strings.has(field.type);
  const select = `select ${fields}, ${stringSort && !anchored ? "null" : value} as sort_value, ${rank} as sort_missing
    from ${ENTRY_SOURCE_SQL} left join user u on u.id=d.updated_by where ${where.join(" and ")}
    order by ${custom ? `${rank} asc, ` : ""}${order} ${direction}, e.id ${direction} limit ${bind.add(limit + 1)}`;
  const columnNames = [
    "id",
    "model_key",
    "published_snapshot_id",
    "updated_at",
    "draft_snapshot_id",
    "draft_revision",
    "title",
    "slug",
    "fields_json",
    "updated_by",
    "updated_by_name",
    "published_at",
    "status",
    "sort_missing",
  ];
  const itemsSql = anchored
    ? `${anchor} select ${valid} as anchor_valid, ${columnNames.map((name) => `page.${name}`).join(",")}, null as sort_value
    from (select 1) guard left join (${select}) page on ${valid}
    order by page.sort_missing asc, page.sort_value collate nocase ${direction}, page.id ${direction}`
    : select;
  const totalsBind = new Bindings(),
    totalsWhere = predicates(input, totalsBind);
  const totalsSql = `select count(*) as total_count, sum(case when e.published_snapshot_id is null then 1 else 0 end) as draft_count,
    sum(case when p.revision=d.revision then 1 else 0 end) as published_count, sum(case when p.revision<>d.revision then 1 else 0 end) as changed_count
    from ${ENTRY_SOURCE_SQL} where ${totalsWhere}`;
  return {
    items: { sql: itemsSql, params: bind.params },
    totals: { sql: totalsSql, params: totalsBind.params },
    page(rows, totals) {
      if (anchored && rows.some((row) => row.anchor_valid !== 1)) invalidCursor();
      const real = rows.filter((row) => row.id !== null),
        selected = real.slice(0, limit),
        last = selected.at(-1);
      let nextCursor;
      if (real.length > limit && last) {
        if (!field) nextCursor = encodeSortCursor(kind, last.sort_value!, last.id);
        else {
          const cursor: FieldCursor = {
            version: 3,
            kind,
            id: last.id,
            type: field.type,
            rank: last.sort_missing,
            ...(stringSort
              ? {
                  boundary: "string-anchor" as const,
                  snapshot: last.draft_snapshot_id,
                  revision: last.draft_revision,
                }
              : {
                  value:
                    last.sort_missing === 1
                      ? null
                      : field.type === "boolean"
                        ? Boolean(last.sort_value)
                        : last.sort_value,
                }),
          };
          nextCursor = opaqueCursor(encodeBase64Url(JSON.stringify(cursor)));
          if (nextCursor.length > 4096) invalidCursor();
        }
      }
      return {
        items: selected.map((row) => entrySummary(row as SummaryRow, input.listFields)),
        totals: entryTotals(totals),
        ...(nextCursor === undefined ? {} : { nextCursor }),
      };
    },
  };
}
