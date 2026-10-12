import type { ContentModelDto } from "@lacecms/contracts";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { EntryStatusBadge, useEntryOverview } from "../../../entities/content/index.js";
import { useSessionRecovery } from "../../../entities/session/index.js";
import {
  adminQueryKeys,
  errorDescription,
  technicalDetails,
  useAdminClient,
} from "../../../shared/api/index.js";
import { formatAbsoluteTime, formatRelativeTime } from "../../../shared/lib/index.js";
import { EmptyState } from "../../../shared/ui/EmptyState/index.js";
import { ErrorState } from "../../../shared/ui/ErrorState/index.js";
import { pageClass } from "../../../shared/ui/layout/index.js";
import { LoadingState } from "../../../shared/ui/LoadingState/index.js";
import { Skeleton } from "../../../shared/ui/Skeleton/index.js";

const cardClass =
  "relative grid content-start gap-3 rounded-lg border border-border bg-card p-4 text-card-foreground shadow-xs transition-colors duration-(--duration-fast) hover:bg-accent/40";
// Stretches the card title link over the whole card for a larger target.
const cardLinkClass =
  "font-semibold text-foreground after:absolute after:inset-0 after:rounded-lg after:content-['']";
const gridClass = "m-0 grid list-none gap-3 p-0 sm:grid-cols-2 xl:grid-cols-3";
const sectionHeadingClass = "m-0 text-sm font-medium text-muted-foreground";

function modelLabel(model: Pick<ContentModelDto, "key" | "label">) {
  return model.label ?? model.key;
}

/** Status overview of every configured page, collection and global. */
export function ContentPage() {
  const client = useAdminClient();
  const models = useQuery({ queryFn: client.listModels, queryKey: adminQueryKeys.models });
  useSessionRecovery(models.error);
  const pages = models.data?.items.filter((model) => model.kind === "page") ?? [];
  const collections = models.data?.items.filter((model) => model.kind === "collection") ?? [];
  const globals = models.data?.items.filter((model) => model.kind === "global") ?? [];
  return (
    <section className={pageClass} aria-labelledby="content-title">
      <h1 id="content-title">Content</h1>
      <p>Pages, collections and site-wide globals defined in your site configuration.</p>
      {models.isPending ? <LoadingState label="Loading content models" lines={3} /> : undefined}
      {models.error === null ? undefined : (
        <ErrorState
          description={errorDescription(models.error)}
          technicalDetails={technicalDetails(models.error)}
        />
      )}
      {models.data?.items.length === 0 ? (
        <EmptyState
          description="Define a page, collection or global in lace.config.ts, restart the local API, then run pnpm content:sync. Models are defined in code."
          title="No content models configured"
        />
      ) : undefined}
      {pages.length === 0 ? undefined : (
        <section aria-labelledby="pages-title" className="grid scroll-mt-4 gap-3" id="pages">
          <h2 className={sectionHeadingClass} id="pages-title">
            Pages
          </h2>
          <ul className={gridClass}>
            {pages.map((model) => (
              <li className="grid" key={model.key}>
                <SingletonCard model={model} />
              </li>
            ))}
          </ul>
        </section>
      )}
      {collections.length === 0 ? undefined : (
        <section aria-labelledby="collections-title" className="grid gap-3">
          <h2 className={sectionHeadingClass} id="collections-title">
            Collections
          </h2>
          <ul className={gridClass}>
            {collections.map((model) => (
              <li className="grid" key={model.key}>
                <CollectionCard model={model} />
              </li>
            ))}
          </ul>
        </section>
      )}
      {globals.length === 0 ? undefined : (
        <section aria-labelledby="site-title" className="grid scroll-mt-4 gap-3" id="site">
          <h2 className={sectionHeadingClass} id="site-title">
            Site
          </h2>
          <ul className={gridClass}>
            {globals.map((model) => (
              <li className="grid" key={model.key}>
                <SingletonCard model={model} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </section>
  );
}

function CardSkeleton({ label }: { readonly label: string }) {
  return (
    <div aria-label={label} className={cardClass} role="status">
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-3 w-40" />
    </div>
  );
}

/** A page or global: one configuration-defined entry, opened directly. */
function SingletonCard({ model }: { readonly model: ContentModelDto }) {
  const overview = useEntryOverview(model.key);
  useSessionRecovery(overview.error);
  const label = modelLabel(model);
  if (overview.isPending) return <CardSkeleton label={`Loading ${label}`} />;
  if (overview.error !== null)
    return (
      <ErrorState
        description={errorDescription(overview.error)}
        technicalDetails={technicalDetails(overview.error)}
        title={`${label} is unavailable`}
      />
    );
  const entry = overview.data.items[0];
  const noun = model.kind === "global" ? "global" : "page";
  if (entry === undefined)
    return (
      <EmptyState
        description={`This ${noun} has no editable draft yet. Local synchronization may be pending: run pnpm content:sync, then reload.`}
        title={model.kind === "global" ? `${label} draft missing` : "Page draft missing"}
      />
    );
  return (
    <article className={cardClass}>
      <div className="flex items-start justify-between gap-2">
        <div className="grid min-w-0 gap-0.5">
          <Link
            className={cardLinkClass}
            params={{ entryId: entry.id, modelKey: model.key }}
            to="/content/$modelKey/$entryId"
          >
            {label}
          </Link>
          {model.path === undefined ? undefined : (
            <span className="truncate font-mono text-xs text-muted-foreground">{model.path}</span>
          )}
          {model.kind === "global" && model.description !== undefined ? (
            <span className="text-xs text-muted-foreground">{model.description}</span>
          ) : undefined}
        </div>
        <EntryStatusBadge status={entry.status} />
      </div>
      <p className="m-0 text-xs text-muted-foreground">
        Edited{" "}
        <time dateTime={entry.updatedAt} title={formatAbsoluteTime(entry.updatedAt)}>
          {formatRelativeTime(entry.updatedAt)}
        </time>{" "}
        by {entry.updatedBy.displayName}
      </p>
    </article>
  );
}

function CollectionCard({ model }: { readonly model: ContentModelDto }) {
  const overview = useEntryOverview(model.key);
  useSessionRecovery(overview.error);
  const label = modelLabel(model);
  if (overview.isPending) return <CardSkeleton label={`Loading ${label}`} />;
  if (overview.error !== null)
    return (
      <ErrorState
        description={errorDescription(overview.error)}
        technicalDetails={technicalDetails(overview.error)}
        title={`${label} is unavailable`}
      />
    );
  const { totals } = overview.data;
  return (
    <article className={cardClass}>
      <div className="grid min-w-0 gap-0.5">
        <Link className={cardLinkClass} params={{ modelKey: model.key }} to="/content/$modelKey">
          {label}
        </Link>
        {model.route === undefined ? undefined : (
          <span className="truncate font-mono text-xs text-muted-foreground">{model.route}</span>
        )}
      </div>
      <p className="m-0 text-2xl font-semibold tabular-nums">
        {totals.all}{" "}
        <span className="text-sm font-normal text-muted-foreground">
          {totals.all === 1 ? "entry" : "entries"}
        </span>
      </p>
      <dl className="m-0 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {(
          [
            ["Published", totals.published],
            ["Changed", totals.changed],
            ["Draft", totals.draft],
          ] as const
        ).map(([name, count]) => (
          <div className="flex gap-1" key={name}>
            <dt>{name}</dt>
            <dd className="m-0 font-medium text-foreground tabular-nums">{count}</dd>
          </div>
        ))}
      </dl>
    </article>
  );
}
