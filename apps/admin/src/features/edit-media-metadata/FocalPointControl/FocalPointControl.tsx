import type { MediaFocalPointDto } from "@lacecms/contracts";
import { Crosshair } from "lucide-react";
import { type KeyboardEvent, type PointerEvent, useRef } from "react";
import { useMediaPreview } from "../../../entities/media/index.js";
import { cn } from "../../../shared/lib/index.js";
import { Button, buttonVariants } from "../../../shared/ui/Button/index.js";
import {
  type FocalPointKey,
  focalPointText,
  pointerFocalPoint,
  stepFocalPoint,
} from "../metadata-form.js";

const focalPointKeys = new Set<string>(["ArrowDown", "ArrowLeft", "ArrowRight", "ArrowUp"]);

/**
 * The media preview as a focal-point control: click or drag on the image to
 * place the point, or focus the marker and use the arrow keys (Shift for
 * larger steps). Without `onChange` it only shows the current point.
 */
export function FocalPointControl({
  disabled = false,
  filename,
  mediaId,
  onChange,
  value,
}: {
  readonly disabled?: boolean;
  readonly filename: string;
  readonly mediaId: string;
  readonly onChange?: ((point: MediaFocalPointDto | null) => void) | undefined;
  readonly value: MediaFocalPointDto | null;
}) {
  const preview = useMediaPreview(mediaId);
  const box = useRef<HTMLDivElement>(null);
  const marker = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const interactive = onChange !== undefined && !disabled;
  const shown = value ?? { x: 0.5, y: 0.5 };
  const text = focalPointText(value);

  function place(event: PointerEvent<HTMLDivElement>) {
    const rect = box.current?.getBoundingClientRect();
    if (rect !== undefined) onChange?.(pointerFocalPoint(rect, event.clientX, event.clientY));
  }

  function startDrag(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragging.current = true;
    place(event);
    marker.current?.focus();
  }

  function endDrag(event: PointerEvent<HTMLDivElement>) {
    if (!dragging.current) return;
    dragging.current = false;
    event.currentTarget.releasePointerCapture(event.pointerId);
  }

  function step(event: KeyboardEvent<HTMLDivElement>) {
    if (!focalPointKeys.has(event.key)) return;
    event.preventDefault();
    onChange?.(stepFocalPoint(value, event.key as FocalPointKey, event.shiftKey));
  }

  return (
    <div className="grid gap-2">
      {preview.state === "loading" ? (
        <span className="text-sm text-muted-foreground" role="status">
          Loading preview for {filename}…
        </span>
      ) : undefined}
      {preview.state === "failed" ? (
        <div className="text-sm" role="status">
          Preview unavailable for {filename}.{" "}
          <button
            className={buttonVariants({ size: "sm", variant: "outline" })}
            onClick={preview.retry}
            type="button"
          >
            Retry preview
          </button>
        </div>
      ) : (
        <div className="flex justify-center rounded-md bg-muted">
          <div
            className={cn("relative inline-block max-w-full", interactive && "cursor-crosshair")}
            ref={box}
            style={interactive ? { touchAction: "none" } : undefined}
            {...(interactive
              ? {
                  onLostPointerCapture: () => {
                    dragging.current = false;
                  },
                  onPointerCancel: endDrag,
                  onPointerDown: startDrag,
                  onPointerMove: (event: PointerEvent<HTMLDivElement>) => {
                    if (dragging.current) place(event);
                  },
                  onPointerUp: endDrag,
                }
              : {})}
          >
            <img
              alt={`Preview of ${filename}`}
              className="block h-auto max-h-80 max-w-full rounded-md select-none"
              draggable={false}
              onError={preview.onError}
              onLoad={preview.onLoad}
              src={preview.source}
            />
            <div
              className={cn(
                "absolute size-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-primary-foreground shadow-md ring-1 ring-primary outline-offset-2 focus-visible:outline-2 focus-visible:outline-ring",
                value === null ? "border-dashed bg-primary/30" : "bg-primary/80",
              )}
              ref={marker}
              style={{ left: `${shown.x * 100}%`, top: `${shown.y * 100}%` }}
              {...(onChange === undefined
                ? { "aria-hidden": true }
                : {
                    "aria-disabled": disabled || undefined,
                    "aria-label": "Focal point",
                    "aria-valuemax": 100,
                    "aria-valuemin": 0,
                    "aria-valuenow": Math.round(shown.x * 100),
                    "aria-valuetext": text,
                    onKeyDown: interactive ? step : undefined,
                    role: "slider",
                    tabIndex: disabled ? -1 : 0,
                  })}
            />
          </div>
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="m-0 flex items-center gap-1.5 text-xs text-muted-foreground">
          <Crosshair aria-hidden="true" className="size-3.5" />
          {`Focal point: ${text}`}
        </p>
        {onChange === undefined ? undefined : (
          <Button
            disabled={disabled || value === null}
            onClick={() => onChange(null)}
            size="sm"
            variant="ghost"
          >
            Reset focal point
          </Button>
        )}
      </div>
      {onChange === undefined ? undefined : (
        <p className="m-0 text-xs text-muted-foreground">
          Click or drag on the image, or focus the marker and use the arrow keys (Shift for larger
          steps). Sites crop images around this point.
        </p>
      )}
    </div>
  );
}
