import type { ContentEntrySortDto, ContentEntrySummaryDto } from "@lacecms/contracts";
import {
  createColumnHelper,
  functionalUpdate,
  rowSortingFeature,
  type SortingState,
  tableFeatures,
  useTable,
} from "@tanstack/react-table";
import { Link } from "@tanstack/react-router";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { useMemo } from "react";
import { EntryStatusBadge } from "../../../entities/content/index.js";
import { formatAbsoluteTime, formatDate, formatRelativeTime } from "../../../shared/lib/index.js";
import { Button } from "../../../shared/ui/Button/index.js";
import { EntryRowActions } from "../EntryRowActions/index.js";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../../shared/ui/Table/index.js";
import {
  formatListValue,
  type ListFieldColumn,
  type SortableColumn,
  sortFromSorting,
  sortingFromSort,
} from "../list-columns.js";

const features = tableFeatures({ rowSortingFeature });
const column = createColumnHelper<typeof features, ContentEntrySummaryDto>();

function Timestamp({ iso, children }: { readonly children: string; readonly iso: string }) {
  const absolute = formatAbsoluteTime(iso);
  return (
    <>
      <time dateTime={iso} title={absolute}>
        {children}
      </time>
      <span className="sr-only">{` (${absolute})`}</span>
    </>
  );
}

/**
 * The server-sorted entry table of one collection. Sorting is manual: header
 * activation reports the next API sort and the rows arrive already ordered.
 */
export function EntryListTable({
  busy = false,
  canManage,
  canPublish = false,
  items,
  label,
  listColumns,
  modelKey,
  now = Date.now(),
  onDeleted,
  onSortChange,
  sort,
}: {
  readonly busy?: boolean;
  readonly canManage: boolean;
  /** Whether published entries may be deleted from their row menus. */
  readonly canPublish?: boolean;
  readonly items: readonly ContentEntrySummaryDto[];
  readonly label: string;
  readonly listColumns: readonly ListFieldColumn[];
  readonly modelKey: string;
  readonly now?: number;
  readonly onDeleted?: () => void;
  readonly onSortChange: (sort: ContentEntrySortDto) => void;
  readonly sort: ContentEntrySortDto;
}) {
  const columns = useMemo(
    () =>
      column.columns([
        column.accessor("title", {
          cell: ({ row }) => (
            <div className="grid gap-0.5">
              <Link
                className="font-medium text-foreground underline-offset-4 hover:underline"
                params={{ entryId: row.original.id, modelKey }}
                to="/content/$modelKey/$entryId"
              >
                {row.original.title}
              </Link>
              {row.original.slug === undefined ? (
                <span className="text-xs text-muted-foreground italic">No slug</span>
              ) : (
                <span className="font-mono text-xs text-muted-foreground">{row.original.slug}</span>
              )}
            </div>
          ),
          header: "Title",
          sortDescFirst: false,
        }),
        column.accessor("status", {
          cell: ({ getValue }) => <EntryStatusBadge status={getValue()} />,
          enableSorting: false,
          header: "Status",
        }),
        ...listColumns.map((listColumn) =>
          column.display({
            cell: ({ row }) => {
              const text = formatListValue(
                listColumn.field,
                row.original.listValues[listColumn.key],
              );
              return (
                <span className="block max-w-48 truncate" title={text}>
                  {text}
                </span>
              );
            },
            header: listColumn.label,
            id: `list:${listColumn.key}`,
          }),
        ),
        column.accessor("publishedAt", {
          cell: ({ getValue }) => {
            const publishedAt = getValue();
            return publishedAt === undefined ? (
              <>
                <span aria-hidden="true" className="text-muted-foreground">
                  —
                </span>
                <span className="sr-only">Not published</span>
              </>
            ) : (
              <Timestamp iso={publishedAt}>{formatDate(publishedAt)}</Timestamp>
            );
          },
          header: "Published",
          sortDescFirst: true,
        }),
        column.accessor("updatedAt", {
          cell: ({ row }) => (
            <div className="grid gap-0.5">
              <Timestamp iso={row.original.updatedAt}>
                {formatRelativeTime(row.original.updatedAt, now)}
              </Timestamp>
              <span className="text-xs text-muted-foreground">
                {`by ${row.original.updatedBy.displayName}`}
              </span>
            </div>
          ),
          header: "Updated",
          sortDescFirst: true,
        }),
        ...(canManage
          ? [
              column.display({
                cell: ({ row }) => (
                  <EntryRowActions
                    canPublish={canPublish}
                    entry={row.original}
                    modelKey={modelKey}
                    {...(onDeleted === undefined ? {} : { onDeleted })}
                  />
                ),
                header: () => <span className="sr-only">Actions</span>,
                id: "actions",
              }),
            ]
          : []),
      ]),
    [canManage, canPublish, listColumns, modelKey, now, onDeleted],
  );
  const sorting: SortingState = [sortingFromSort(sort)];
  const table = useTable({
    columns,
    data: items,
    enableMultiSort: false,
    enableSortingRemoval: false,
    features,
    getRowId: (row) => row.id,
    manualSorting: true,
    onSortingChange: (updater) => {
      const [next] = functionalUpdate(updater, sorting);
      if (next !== undefined) onSortChange(sortFromSorting(next.id as SortableColumn, next.desc));
    },
    state: { sorting },
  });

  return (
    <Table aria-busy={busy} aria-label={`${label} entries`}>
      <TableHeader>
        {table.getHeaderGroups().map((headerGroup) => (
          <TableRow key={headerGroup.id}>
            {headerGroup.headers.map((header) => {
              const sorted = header.column.getIsSorted();
              if (!header.column.getCanSort())
                return (
                  <TableHead key={header.id}>
                    <table.FlexRender header={header} />
                  </TableHead>
                );
              const SortIcon =
                sorted === "asc" ? ArrowUp : sorted === "desc" ? ArrowDown : ArrowUpDown;
              return (
                <TableHead
                  aria-sort={
                    sorted === "asc" ? "ascending" : sorted === "desc" ? "descending" : "none"
                  }
                  key={header.id}
                >
                  <Button
                    className="-ml-2 px-2"
                    onClick={header.column.getToggleSortingHandler()}
                    size="sm"
                    variant="ghost"
                  >
                    <table.FlexRender header={header} />
                    <SortIcon
                      aria-hidden="true"
                      className={sorted === false ? "text-muted-foreground" : undefined}
                    />
                  </Button>
                </TableHead>
              );
            })}
          </TableRow>
        ))}
      </TableHeader>
      <TableBody className={busy ? "opacity-60 transition-opacity" : undefined}>
        {table.getRowModel().rows.map((row) => (
          <TableRow key={row.id}>
            {row.getAllCells().map((cell) => (
              <TableCell key={cell.id}>
                <table.FlexRender cell={cell} />
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
