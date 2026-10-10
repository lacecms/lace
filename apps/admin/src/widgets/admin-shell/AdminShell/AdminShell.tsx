import { useQuery } from "@tanstack/react-query";
import { useSession, useSessionRecovery } from "../../../entities/session/index.js";
import { IntroductoryTour, type TourHandle } from "../IntroductoryTour/index.js";
import { tourSteps } from "../tour.js";
import { tourStorageKey } from "../tour-storage.js";
import { Outlet, useRouter } from "@tanstack/react-router";
import { useRef, useState, type ReactNode } from "react";
import { useSignOut } from "../../../features/sign-out/index.js";
import {
  adminQueryKeys,
  useAdminClient,
  errorDescription,
  technicalDetails,
} from "../../../shared/api/index.js";
import { ErrorState } from "../../../shared/ui/ErrorState/index.js";
import { HeaderActionsTargetContext } from "../header-actions.js";
import { ShellHeader } from "../ShellHeader/index.js";
import { SidebarNav } from "../SidebarNav/index.js";

/**
 * The inset-panel shell: a persistent sidebar from `md` up, a sheet below it,
 * and the route content in a raised panel under breadcrumbs.
 */
export function AdminShell({ children }: { readonly children: ReactNode }) {
  const session = useSession();
  const router = useRouter();
  const client = useAdminClient();
  const models = useQuery({ queryFn: client.listModels, queryKey: adminQueryKeys.models });
  useSessionRecovery(models.error);
  const scope = {
    origin: window.location.origin,
    basepath: router.options.basepath ?? "/",
    userId: session.id,
  };
  const tour = useRef<TourHandle>(null);
  const onIntroduction = (opener: HTMLElement | null) => tour.current?.start(opener);
  const fallbackFocus = () =>
    Array.from(
      document.querySelectorAll<HTMLElement>(
        '[data-introduction-fallback="mobile"], aside [aria-label$="account menu"]',
      ),
    ).find((element) => element.getClientRects().length > 0) ??
    document.getElementById("main-content");
  const signOut = useSignOut();
  const signOutProps = { onSignOut: () => signOut.mutate(), signingOut: signOut.isPending };
  const [actionsTarget, setActionsTarget] = useState<HTMLElement | null>(null);
  return (
    <HeaderActionsTargetContext.Provider value={actionsTarget}>
      <div className="min-h-screen bg-sidebar md:flex">
        <a
          className="sr-only z-50 rounded-md bg-background px-3 py-2 text-sm font-medium shadow-md focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
          href="#main-content"
        >
          Skip to content
        </a>
        <aside
          aria-label="Admin navigation"
          className="hidden w-60 shrink-0 md:sticky md:top-0 md:block md:h-screen"
        >
          <SidebarNav {...signOutProps} onIntroduction={onIntroduction} />
        </aside>
        <div className="flex min-h-screen min-w-0 flex-1 flex-col bg-background md:m-2 md:ml-0 md:min-h-[calc(100vh-1rem)] md:rounded-xl md:border md:border-border md:shadow-xs">
          <ShellHeader
            actionsRef={setActionsTarget}
            {...signOutProps}
            onIntroduction={onIntroduction}
          />
          <main className="min-w-0 flex-1 p-4 outline-none md:p-6" id="main-content" tabIndex={-1}>
            {signOut.error === null ? undefined : (
              <div className="mb-4">
                <ErrorState
                  description={errorDescription(signOut.error)}
                  technicalDetails={technicalDetails(signOut.error)}
                />
              </div>
            )}
            <IntroductoryTour
              key={tourStorageKey(scope)}
              scope={scope}
              steps={tourSteps(session, models.isError ? undefined : models.data?.items)}
              ref={tour}
              fallbackFocus={fallbackFocus}
            />
            {children}
          </main>
        </div>
      </div>
    </HeaderActionsTargetContext.Provider>
  );
}

/** Route component for the protected layout: the shell around the matched screen. */
export function AdminShellLayout() {
  return (
    <AdminShell>
      <Outlet />
    </AdminShell>
  );
}
