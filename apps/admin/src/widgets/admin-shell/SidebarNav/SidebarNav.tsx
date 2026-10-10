import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { LayoutGrid } from "lucide-react";
import { useEntryOverview } from "../../../entities/content/index.js";
import { useSession, useSessionRecovery } from "../../../entities/session/index.js";
import { adminQueryKeys, useAdminClient } from "../../../shared/api/index.js";
import { Skeleton } from "../../../shared/ui/Skeleton/index.js";
import { navigationGroups, type NavigationItem } from "../navigation.js";
import { UserMenu } from "../UserMenu/index.js";

const itemClass =
  "flex min-h-8 items-center gap-2 rounded-md px-2 py-1.5 text-sm text-sidebar-foreground transition-colors duration-(--duration-fast) hover:bg-sidebar-accent hover:text-sidebar-accent-foreground aria-[current=page]:bg-sidebar-accent aria-[current=page]:font-medium aria-[current=page]:text-sidebar-accent-foreground [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-muted-foreground";

/** Brand, grouped role-aware navigation, and the user menu; rendered in the aside and the sheet. */
export function SidebarNav({
  onNavigate,
  onIntroduction,
  onSignOut,
  signingOut,
}: {
  readonly onIntroduction?: ((opener: HTMLElement | null) => void) | undefined;
  readonly onNavigate?: (() => void) | undefined;
  readonly onSignOut: () => void;
  readonly signingOut: boolean;
}) {
  const session = useSession();
  const navigate = useNavigate();
  const client = useAdminClient();
  const models = useQuery({ queryFn: client.listModels, queryKey: adminQueryKeys.models });
  useSessionRecovery(models.error);
  const groups = navigationGroups(session, models.data?.items);
  return (
    <div className="flex h-full min-h-0 flex-col gap-4 p-3">
      <p className="m-0 flex items-center gap-2 px-2 py-1 text-base font-semibold text-sidebar-foreground">
        <span
          aria-hidden="true"
          className="grid size-6 place-items-center rounded-md bg-sidebar-primary text-xs text-sidebar-primary-foreground"
        >
          L
        </span>
        Lace
      </p>
      <nav aria-label="Main" className="grid min-h-0 flex-1 content-start gap-4 overflow-y-auto">
        <Link
          activeOptions={{ exact: true, includeHash: true }}
          className={itemClass}
          onClick={onNavigate}
          to="/content"
        >
          <LayoutGrid aria-hidden="true" />
          <span className="truncate">Content</span>
        </Link>
        {models.isPending ? (
          <div aria-label="Loading content navigation" className="grid gap-2 px-2" role="status">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-6" />
            <Skeleton className="h-6" />
          </div>
        ) : undefined}
        {models.error === null ? undefined : (
          <p className="px-2 text-xs text-muted-foreground">Content navigation is unavailable.</p>
        )}
        {groups.map((group) => (
          <div className="grid gap-1" key={group.key}>
            <p
              className="px-2 text-xs font-medium text-muted-foreground"
              id={`nav-group-${group.key}`}
            >
              {group.label}
            </p>
            <ul
              aria-labelledby={`nav-group-${group.key}`}
              className="m-0 grid list-none gap-0.5 p-0"
            >
              {group.items.map((item) => (
                <li key={item.kind === "resource" ? item.path : item.modelKey}>
                  <NavigationLink item={item} onNavigate={onNavigate} />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
      <UserMenu
        onAccount={() => {
          onNavigate?.();
          void navigate({ to: "/account" });
        }}
        onIntroduction={onIntroduction}
        displayName={session.displayName}
        onSignOut={onSignOut}
        role={session.role}
        signingOut={signingOut}
      />
    </div>
  );
}

function NavigationLink({
  item,
  onNavigate,
}: {
  readonly item: NavigationItem;
  readonly onNavigate?: (() => void) | undefined;
}) {
  const Icon = item.icon;
  if (item.kind === "page") return <PageLink item={item} onNavigate={onNavigate} />;
  if (item.kind === "collection") return <CollectionLink item={item} onNavigate={onNavigate} />;
  return (
    <Link className={itemClass} onClick={onNavigate} to={item.path}>
      <Icon aria-hidden="true" />
      <span className="truncate">{item.label}</span>
    </Link>
  );
}

function PageLink({
  item,
  onNavigate,
}: {
  readonly item: Extract<NavigationItem, { kind: "page" }>;
  readonly onNavigate?: (() => void) | undefined;
}) {
  const overview = useEntryOverview(item.modelKey);
  useSessionRecovery(overview.error);
  const singleton = overview.data?.items[0];
  const Icon = item.icon;
  const content = (
    <>
      <Icon aria-hidden="true" />
      <span className="truncate">{item.label}</span>
    </>
  );
  // Without a synchronized singleton the overview's Pages section explains the
  // pending sync; the hash keeps the link from claiming the overview as current.
  return singleton === undefined ? (
    <Link
      activeOptions={{ includeHash: true }}
      className={itemClass}
      hash="pages"
      onClick={onNavigate}
      to="/content"
    >
      {content}
    </Link>
  ) : (
    <Link
      activeOptions={{ exact: true }}
      className={itemClass}
      onClick={onNavigate}
      params={{ entryId: singleton.id, modelKey: item.modelKey }}
      to="/content/$modelKey/$entryId"
    >
      {content}
    </Link>
  );
}

function CollectionLink({
  item,
  onNavigate,
}: {
  readonly item: Extract<NavigationItem, { kind: "collection" }>;
  readonly onNavigate?: (() => void) | undefined;
}) {
  const overview = useEntryOverview(item.modelKey);
  useSessionRecovery(overview.error);
  const count = overview.data?.totals.all;
  const Icon = item.icon;
  return (
    <Link
      className={itemClass}
      onClick={onNavigate}
      params={{ modelKey: item.modelKey }}
      to="/content/$modelKey"
    >
      <Icon aria-hidden="true" />
      <span className="truncate">{item.label}</span>
      {count === undefined ? undefined : (
        <>
          <span aria-hidden="true" className="ml-auto text-xs text-muted-foreground tabular-nums">
            {count}
          </span>
          <span className="sr-only">{`, ${count} ${count === 1 ? "entry" : "entries"}`}</span>
        </>
      )}
    </Link>
  );
}
