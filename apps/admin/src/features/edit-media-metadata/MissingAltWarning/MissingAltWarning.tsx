import { TriangleAlert } from "lucide-react";
import { cn } from "../../../shared/lib/index.js";

/** Non-blocking notice that an image has no alt text and will be treated as decorative. */
export function MissingAltWarning({
  children = "This media has no alt text. Images that use it without their own alt text are presented as decorative.",
  className,
  id,
}: {
  readonly children?: string;
  readonly className?: string;
  readonly id?: string;
}) {
  return (
    <p
      className={cn(
        "m-0 flex items-start gap-1.5 rounded-md bg-warning px-2.5 py-1.5 text-xs text-warning-foreground",
        className,
      )}
      id={id}
    >
      <TriangleAlert aria-hidden="true" className="mt-px size-3.5 shrink-0" />
      <span>{children}</span>
    </p>
  );
}
