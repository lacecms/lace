import type { MediaMetadataDto } from "@lacecms/contracts";
import {
  formatMediaDimensions,
  MediaStatusBadge,
  MediaThumbnail,
  mediaTypeLabel,
} from "../../../entities/media/index.js";
import { cn, formatAbsoluteTime, formatBytes, formatDate } from "../../../shared/lib/index.js";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../../shared/ui/Table/index.js";

/** Media as table rows with their facts; the filename opens the item's details. */
export function MediaListTable({
  busy = false,
  items,
  label,
  onOpen,
}: {
  readonly busy?: boolean;
  readonly items: readonly MediaMetadataDto[];
  readonly label: string;
  readonly onOpen: (item: MediaMetadataDto, opener: HTMLElement) => void;
}) {
  return (
    <Table
      aria-busy={busy || undefined}
      aria-label={label}
      className={cn("transition-opacity duration-(--duration-fast)", busy && "opacity-60")}
    >
      <TableHeader>
        <TableRow>
          <TableHead className="w-12">
            <span className="sr-only">Preview</span>
          </TableHead>
          <TableHead>Filename</TableHead>
          <TableHead>Type</TableHead>
          <TableHead>Dimensions</TableHead>
          <TableHead>Size</TableHead>
          <TableHead>Uploaded by</TableHead>
          <TableHead>Uploaded</TableHead>
          <TableHead>Used in</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((item) => (
          <TableRow key={item.id}>
            <TableCell>
              <MediaThumbnail className="size-9 rounded-sm" mediaId={item.id} />
            </TableCell>
            <TableCell>
              <div className="flex max-w-72 items-center gap-2">
                <button
                  aria-haspopup="dialog"
                  className="cursor-pointer truncate text-left font-medium underline-offset-4 hover:underline focus-visible:underline"
                  data-media-result={item.id}
                  onClick={(event) => onOpen(item, event.currentTarget)}
                  title={item.filename}
                  type="button"
                >
                  {item.filename}
                </button>
                {item.status === "active" ? undefined : <MediaStatusBadge status={item.status} />}
              </div>
            </TableCell>
            <TableCell>{mediaTypeLabel(item.mimeType)}</TableCell>
            <TableCell className="tabular-nums">{formatMediaDimensions(item)}</TableCell>
            <TableCell className="tabular-nums">{formatBytes(item.size)}</TableCell>
            <TableCell>{item.createdBy.displayName}</TableCell>
            <TableCell>
              <time dateTime={item.createdAt} title={formatAbsoluteTime(item.createdAt)}>
                {formatDate(item.createdAt)}
              </time>
            </TableCell>
            <TableCell className="tabular-nums">
              {item.usageCount === 1 ? "1 entry" : `${item.usageCount} entries`}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
