import type { ContentEntrySortDto, ContentModelDto, FieldMetadataMapDto } from "@lacecms/contracts";
import { formatAbsoluteTime, formatDate } from "../../shared/lib/index.js";

type FieldMetadata = FieldMetadataMapDto[string];

/** A configured list-field column: its key, header label, and field metadata. */
export interface ListFieldColumn {
  readonly sortable?: boolean;
  readonly filterable?: boolean;
  readonly field: FieldMetadata;
  readonly key: string;
  readonly label: string;
}

/** The model's `listFields` in configuration order, labelled from field metadata. */
export function listFieldColumns(model: ContentModelDto): readonly ListFieldColumn[] {
  return (model.listFields ?? []).flatMap((key) => {
    const field = model.fields[key];
    return field === undefined
      ? []
      : [
          {
            field,
            key,
            label: field.label ?? key,
            ...(model.listOptions?.sortableFields?.includes(key) ? { sortable: true } : {}),
            ...(model.listOptions?.filterableFields?.includes(key) ? { filterable: true } : {}),
          },
        ];
  });
}

const numberFormat = new Intl.NumberFormat("en");

/** Formats a list value by its field type; missing or mismatched values become a dash. */
export function formatListValue(field: FieldMetadata, value: unknown): string {
  switch (field.type) {
    case "boolean":
      return typeof value === "boolean" ? (value ? "Yes" : "No") : "—";
    case "number":
      return typeof value === "number" && Number.isFinite(value) ? numberFormat.format(value) : "—";
    case "date":
      return (typeof value === "string" && formatDate(value)) || "—";
    case "datetime":
      return (typeof value === "string" && formatAbsoluteTime(value)) || "—";
    default:
      return typeof value === "string" && value.length > 0 ? value : "—";
  }
}

export type SortableColumn = "publishedAt" | "title" | "updatedAt" | `field:${string}`;

/** One-column sorting state equivalent to an API sort value. */
export function sortingFromSort(sort: ContentEntrySortDto): { desc: boolean; id: SortableColumn } {
  const desc = sort.startsWith("-");
  return { desc, id: (desc ? sort.slice(1) : sort) as SortableColumn };
}

/** The API sort value for a sortable column and direction. */
export function sortFromSorting(id: SortableColumn, desc: boolean): ContentEntrySortDto {
  return desc ? `-${id}` : id;
}
