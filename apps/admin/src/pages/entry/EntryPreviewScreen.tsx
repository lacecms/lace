import {
  previewFrameMessageSchema,
  type PreviewFrameStatus,
  type PreviewReadinessDto,
  type PreviewStatusDto,
} from "@lacecms/contracts";
import { ExternalLinkIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { safeParse } from "valibot";
import { formatAbsoluteTime, formatRelativeTime, isSaveShortcut } from "../../shared/lib/index.js";
import { Button } from "../../shared/ui/Button/index.js";
import {
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "../../shared/ui/Dialog/index.js";

type FrameState = "opening" | PreviewFrameStatus;
type ReadyConfig = Extract<PreviewReadinessDto, { ready: true }>;
type Preview = NonNullable<PreviewStatusDto>;
const frameTimeoutMs = 15_000;

function startUrl(origin: string, path: string): string {
  const url = new URL("/access/start", origin);
  url.searchParams.set("return", path);
  return url.href;
}

function PreviewFrame({ id, origin }: { readonly id: string; readonly origin: string }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState<FrameState>("opening");
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    function onMessage(event: MessageEvent<unknown>) {
      const source = frame.current?.contentWindow;
      if (!source || event.source !== source || event.origin !== origin) return;
      const message = safeParse(previewFrameMessageSchema, event.data);
      if (message.success && message.output.generationId === id) {
        window.clearTimeout(timeout);
        setStatus(message.output.status);
      }
    }
    const timeout = window.setTimeout(() => setStatus("unavailable"), frameTimeoutMs);
    window.addEventListener("message", onMessage);
    return () => {
      window.clearTimeout(timeout);
      window.removeEventListener("message", onMessage);
    };
  }, [attempt, id, origin]);

  const frameVisible = status === "opening" || status === "ready";
  return (
    <div className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)] bg-muted/50">
      <div className="flex flex-wrap items-center gap-2 border-b bg-background px-4 py-2">
        <div role="group" aria-label="Preview width" className="flex gap-1">
          <Button
            aria-pressed={!narrow}
            onClick={() => setNarrow(false)}
            size="sm"
            variant={narrow ? "outline" : "secondary"}
          >
            Desktop
          </Button>
          <Button
            aria-pressed={narrow}
            onClick={() => setNarrow(true)}
            size="sm"
            variant={narrow ? "secondary" : "outline"}
          >
            Narrow
          </Button>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
          aria-disabled={status === "opening"}
          onClick={() => {
            if (status === "opening") return;
            setStatus("opening");
            setAttempt((value) => value + 1);
          }}
        >
          Reload preview
        </Button>
        <p role="status" className="m-0 text-sm text-muted-foreground">
          {status === "opening"
            ? "Opening preview…"
            : status === "sign-in"
              ? "Open in a new tab to sign in, then reload the preview here."
              : status === "unavailable"
                ? "The preview could not be opened here. Reload it or open it in a new tab."
                : ""}
        </p>
      </div>
      {frameVisible && (
        <iframe
          key={attempt}
          ref={frame}
          title="Draft site page"
          src={startUrl(origin, `/p/${id}/`)}
          className={`mx-auto size-full border-0 bg-background ${narrow ? "max-w-[390px]" : ""}`}
          referrerPolicy="no-referrer"
          sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads"
          tabIndex={status === "ready" ? undefined : -1}
        />
      )}
    </div>
  );
}

export function EntryPreviewScreen({
  config,
  preview,
  savedRevision,
  title,
  unavailable,
  returnFocus,
}: {
  readonly config: ReadyConfig;
  readonly preview: Preview;
  readonly savedRevision: number;
  readonly title: string;
  readonly unavailable: string | undefined;
  readonly returnFocus: () => void;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  return (
    <DialogContent
      className="top-0 left-0 h-dvh max-w-none translate-x-0 translate-y-0 grid-rows-[auto_minmax(0,1fr)] gap-0 overflow-hidden rounded-none border-0 p-0 sm:max-w-none"
      showCloseButton={false}
      onOpenAutoFocus={(event) => {
        event.preventDefault();
        heading.current?.focus();
      }}
      onCloseAutoFocus={(event) => {
        event.preventDefault();
        returnFocus();
      }}
      onKeyDown={(event) => {
        if (!isSaveShortcut(event.nativeEvent)) return;
        event.preventDefault();
        event.stopPropagation();
      }}
    >
      <header className="flex flex-wrap items-start justify-between gap-3 border-b px-4 py-3">
        <div className="grid min-w-0 gap-1.5 break-words">
          <DialogTitle ref={heading} tabIndex={-1}>
            Preview of {title || "Untitled"}
          </DialogTitle>
          <DialogDescription className="m-0">
            Captured revision {preview.revision}
            {preview.readyAt && (
              <>
                {" · Ready "}
                <time dateTime={preview.readyAt} title={formatAbsoluteTime(preview.readyAt)}>
                  {formatRelativeTime(preview.readyAt)}
                </time>
              </>
            )}
            {preview.expiresAt && (
              <>
                {" "}
                · Expires{" "}
                <time dateTime={preview.expiresAt}>{formatAbsoluteTime(preview.expiresAt)}</time>
              </>
            )}
          </DialogDescription>
          {preview.revision !== savedRevision && (
            <p className="m-0 text-sm">The saved draft is revision {savedRevision}.</p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <DialogClose asChild>
            <Button variant="outline">Back to editor</Button>
          </DialogClose>
          <Button asChild>
            <a
              href={startUrl(config.origin, `/view/${preview.id}`)}
              target="_blank"
              rel="noopener noreferrer"
            >
              Open in new tab <ExternalLinkIcon aria-hidden="true" />
            </a>
          </Button>
        </div>
      </header>
      {unavailable ? (
        <p role="status" className="m-0 p-4">
          {unavailable}
        </p>
      ) : config.viewMode === "iframe" &&
        new URL(config.origin).hostname !== window.location.hostname ? (
        <PreviewFrame id={preview.id} origin={config.origin} />
      ) : (
        <p className="m-0 p-4">
          Open the preview in a new tab so your browser can establish a preview session on its host.
        </p>
      )}
    </DialogContent>
  );
}
