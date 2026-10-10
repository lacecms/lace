import { CurrentBuildSite } from "../../../widgets/current-build-site/index.js";
import { useQuery } from "@tanstack/react-query";
import { getRouteApi } from "@tanstack/react-router";
import { KeyRound } from "lucide-react";
import { useSession, useSessionRecovery } from "../../../entities/session/index.js";
import { CreateBuildTokenDialog } from "../../../features/create-build-token/index.js";
import {
  adminQueryKeys,
  errorDescription,
  technicalDetails,
  useAdminClient,
} from "../../../shared/api/index.js";
import { EmptyState } from "../../../shared/ui/EmptyState/index.js";
import { ErrorState } from "../../../shared/ui/ErrorState/index.js";
import { pageClass } from "../../../shared/ui/layout/index.js";
import { LoadingState } from "../../../shared/ui/LoadingState/index.js";
import { PageAccessDenied } from "../../../shared/ui/PageState/index.js";
import { BuildTokenTable } from "../BuildTokenTable/index.js";
import { SiteStatusCards } from "../SiteStatusCards/index.js";

const settingsRoute = getRouteApi("/_protected/settings");

export function SettingsPage() {
  const { permitted } = settingsRoute.useRouteContext();
  return permitted ? <SettingsManager /> : <PageAccessDenied />;
}

function SettingsManager() {
  const client = useAdminClient();
  const session = useSession();
  const status = useQuery({
    queryKey: adminQueryKeys.settingsStatus,
    queryFn: client.loadSettingsStatus,
  });
  const tokens = useQuery({ queryKey: adminQueryKeys.tokens, queryFn: client.listTokens });
  useSessionRecovery(status.error ?? tokens.error);
  const items = tokens.data?.items;
  return (
    <section className={pageClass} aria-labelledby="settings-title">
      <div className="grid gap-1">
        <h1 id="settings-title">Settings</h1>
        <p className="m-0 text-muted-foreground">
          Check the site's API and manage the read-only tokens its builds use.
        </p>
      </div>
      <CurrentBuildSite />
      <SiteStatusCards
        activeTokens={items?.filter((token) => token.revokedAt === undefined).length}
        error={status.error}
        onRefresh={() => void status.refetch()}
        recipient={session.email}
        refreshing={status.isFetching}
        status={status.data}
      />
      <section aria-labelledby="build-tokens-title" className="grid gap-3">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="grid gap-1">
            <h2 id="build-tokens-title">Build tokens</h2>
            <p className="m-0 text-muted-foreground">
              A build token lets the static site read published content. Its value is shown only
              once, when it is created.
            </p>
          </div>
          {/* One stable instance: the list refreshing must not unmount a shown token. */}
          <CreateBuildTokenDialog />
        </div>
        {tokens.isPending ? <LoadingState label="Loading tokens" lines={3} /> : undefined}
        {tokens.error === null ? undefined : (
          <ErrorState
            description={errorDescription(tokens.error)}
            onRetry={() => void tokens.refetch()}
            retrying={tokens.isFetching}
            technicalDetails={technicalDetails(tokens.error)}
          />
        )}
        {items?.length === 0 ? (
          <EmptyState
            description="Create a token to connect the local Astro site."
            icon={KeyRound}
            title="No build tokens"
          />
        ) : undefined}
        {items === undefined || items.length === 0 ? undefined : <BuildTokenTable tokens={items} />}
      </section>
    </section>
  );
}
