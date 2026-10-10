import { useQueryClient } from "@tanstack/react-query";
import { getRouteApi, rootRouteId, useRouter } from "@tanstack/react-router";
import { useEffect } from "react";
import { isSessionExpiredError } from "../../shared/api/index.js";
import {
  can,
  type AdminPermission,
  type AdminSession,
  type AdminSessionSource,
} from "./session.js";

const rootRoute = getRouteApi(rootRouteId);
const protectedRoute = getRouteApi("/_protected");

/** The session source the application router was created with. */
export function useSessionSource(): AdminSessionSource {
  return rootRoute.useRouteContext().sessionSource;
}

/** The resolved session of the signed-in user; only available below the protected route. */
export function useSession(): AdminSession {
  return protectedRoute.useRouteContext().session;
}

/** Whether the signed-in user holds a permission; only available below the protected route. */
export function useCan(permission: AdminPermission): boolean {
  return can(useSession(), permission);
}

/** Returns to login with cleared remote state when a request reports an expired session. */
export function useSessionRecovery(error: unknown) {
  const sessionSource = useSessionSource();
  const router = useRouter();
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!isSessionExpiredError(error)) return;
    void (async () => {
      sessionSource.invalidate();
      if ((await sessionSource.get()) !== null) return;
      // Keep the dirty editor mounted while its leave confirmation resolves.
      await router.navigate({ search: { redirect: "/content" }, to: "/login" });
      if (router.state.matches.some((match) => match.routeId === "/login")) queryClient.clear();
    })();
  }, [error, queryClient, router, sessionSource]);
}
