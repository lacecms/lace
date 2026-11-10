import { useRef } from "react";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  CopyIcon,
  EyeIcon,
  EyeOffIcon,
  MoreHorizontalIcon,
  Trash2Icon,
} from "lucide-react";
import { Button } from "../../../shared/ui/Button/index.js";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../../../shared/ui/DropdownMenu/index.js";

export function BlockCardMenu({
  busy,
  duplicateProblem,
  hiddenOnSite,
  index,
  label,
  onAnnounce,
  onDuplicate,
  onHiddenChange,
  onMove,
  onRemove,
  readOnly,
  total,
}: {
  readonly busy: boolean;
  readonly duplicateProblem?: string | undefined;
  readonly hiddenOnSite: boolean;
  readonly index: number;
  readonly label: string;
  readonly onAnnounce?: ((message: string) => void) | undefined;
  readonly onDuplicate: () => void;
  readonly onHiddenChange: (hidden: boolean) => void;
  readonly onMove: (target: number) => void;
  readonly onRemove: () => void;
  readonly readOnly: boolean;
  readonly total: number;
}) {
  const afterClose = useRef<() => void>(undefined);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          disabled={busy}
          aria-label={`Actions for ${label} block`}
          size="icon-sm"
          variant="ghost"
        >
          <MoreHorizontalIcon aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        onCloseAutoFocus={(event) => {
          const action = afterClose.current;
          if (action === undefined) return;
          afterClose.current = undefined;
          event.preventDefault();
          action();
        }}
      >
        <DropdownMenuItem disabled={busy || index === 0} onSelect={() => onMove(index - 1)}>
          <ArrowUpIcon aria-hidden />
          Move up
        </DropdownMenuItem>
        <DropdownMenuItem disabled={busy || index === total - 1} onSelect={() => onMove(index + 1)}>
          <ArrowDownIcon aria-hidden />
          Move down
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={busy || !!duplicateProblem}
          title={duplicateProblem}
          onSelect={() => {
            afterClose.current = onDuplicate;
          }}
        >
          <CopyIcon aria-hidden />
          Duplicate
        </DropdownMenuItem>
        {readOnly ? undefined : (
          <DropdownMenuItem
            disabled={busy}
            onSelect={() => {
              if (busy || readOnly) return;
              onHiddenChange(!hiddenOnSite);
              onAnnounce?.(
                `${label} block ${index + 1} ${hiddenOnSite ? "shown on" : "hidden from"} the site.`,
              );
            }}
          >
            {hiddenOnSite ? <EyeIcon aria-hidden /> : <EyeOffIcon aria-hidden />}
            {hiddenOnSite ? "Show block" : "Hide block"}
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          disabled={busy}
          onSelect={() => {
            afterClose.current = onRemove;
          }}
          variant="destructive"
        >
          <Trash2Icon aria-hidden />
          Remove
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
