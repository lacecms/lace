import { useQuery } from "@tanstack/react-query";
import { Link, useMatches } from "@tanstack/react-router";
import { ChevronRight, PanelLeft } from "lucide-react";
import { useRef, useState } from "react";
import { adminQueryKeys, useAdminClient } from "../../shared/api/index.js";
import { Button } from "../../shared/ui/Button/index.js";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "../../shared/ui/Sheet/index.js";
import { breadcrumbsFor, type Breadcrumb } from "./navigation.js";
import { SidebarNav } from "./SidebarNav/index.js";

/**
 * Sticky route header: the narrow-screen navigation sheet, breadcrumbs for the
 * current screen, and the element that receives the screen's page actions.
 */
export function ShellHeader({
  actionsRef,
  onIntroduction,
  onSignOut,
  signingOut,
}: {
  readonly onIntroduction?: ((opener: HTMLElement | null) => void) | undefined;
  readonly actionsRef?: (element: HTMLElement | null) => void;
  readonly onSignOut: () => void;
  readonly signingOut: boolean;
}) {
  const navTrigger = useRef<HTMLButtonElement>(null);
  const replayPending = useRef(false);
  const [navOpen, setNavOpen] = useState(false);
  return (
    <header className="sticky top-0 z-30 flex min-h-12 flex-wrap items-center gap-x-2 gap-y-1.5 border-b border-border bg-background px-4 py-1.5 md:rounded-t-xl md:px-6">
      <Sheet onOpenChange={setNavOpen} open={navOpen}>
        <SheetTrigger asChild>
          <Button
            ref={navTrigger}
            data-introduction-fallback="mobile"
            aria-label="Open navigation"
            className="-ml-2 md:hidden"
            size="icon"
            variant="ghost"
          >
            <PanelLeft aria-hidden="true" />
          </Button>
        </SheetTrigger>
        <SheetContent
          className="w-72 bg-sidebar p-0"
          side="left"
          onCloseAutoFocus={() => {
            if (replayPending.current) {
              replayPending.current = false;
              queueMicrotask(() => onIntroduction?.(navTrigger.current));
            }
          }}
        >
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <SidebarNav
            onIntroduction={
              onIntroduction === undefined
                ? undefined
                : () => {
                    replayPending.current = true;
                    setNavOpen(false);
                  }
            }
            onNavigate={() => setNavOpen(false)}
            onSignOut={onSignOut}
            signingOut={signingOut}
          />
        </SheetContent>
      </Sheet>
      <Breadcrumbs />
      <div
        className="ml-auto flex shrink-0 items-center gap-2 empty:hidden"
        data-slot="header-actions"
        ref={actionsRef}
      />
    </header>
  );
}

function Breadcrumbs() {
  const deepest = useMatches().at(-1);
  const params = (deepest?.params ?? {}) as Readonly<Record<string, string | undefined>>;
  const client = useAdminClient();
  const models = useQuery({ queryFn: client.listModels, queryKey: adminQueryKeys.models });
  const entryId = params.entryId;
  // Same key and loader as the editor, so the title is shared rather than refetched.
  const entry = useQuery({
    enabled: entryId !== undefined,
    queryFn: () => client.loadEntry(entryId ?? ""),
    queryKey: adminQueryKeys.entry(entryId ?? ""),
  });
  const crumbs = breadcrumbsFor({
    entryTitle: entry.data?.draft.title,
    models: models.data?.items,
    params,
    routeId: deepest?.routeId ?? "",
  });
  if (crumbs.length === 0) return null;
  return (
    <nav aria-label="Breadcrumb" className="min-w-0 flex-1 basis-48">
      <ol className="m-0 flex list-none flex-wrap items-center gap-1.5 p-0 text-sm text-muted-foreground">
        {crumbs.map((crumb, index) => (
          <li className="flex min-w-0 items-center gap-1.5" key={`${index}:${crumb.label}`}>
            {index === 0 ? undefined : <ChevronRight aria-hidden="true" className="size-3.5" />}
            <Crumb crumb={crumb} current={index === crumbs.length - 1} />
          </li>
        ))}
      </ol>
    </nav>
  );
}

function Crumb({ crumb, current }: { readonly crumb: Breadcrumb; readonly current: boolean }) {
  if (current || crumb.to === undefined)
    return (
      <span
        aria-current={current ? "page" : undefined}
        className="truncate font-medium text-foreground"
      >
        {crumb.label}
      </span>
    );
  const className = "truncate transition-colors duration-(--duration-fast) hover:text-foreground";
  return crumb.to === "/content" ? (
    <Link activeOptions={{ exact: true }} className={className} to="/content">
      {crumb.label}
    </Link>
  ) : (
    <Link activeOptions={{ exact: true }} className={className} params={crumb.params} to={crumb.to}>
      {crumb.label}
    </Link>
  );
}
