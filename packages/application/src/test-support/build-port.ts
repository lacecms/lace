import type { SiteBuildDispatchPort } from "../ports/builds.js";

/** Supplies named failures for unimplemented build work operations. */
export function buildWorkPort(overrides: Partial<SiteBuildDispatchPort>): SiteBuildDispatchPort {
  const missing = (member: string) => () => {
    throw new Error(`Unexpected build port call: ${member}`);
  };
  return {
    claimSiteBuilds: missing("claimSiteBuilds"),
    renewSiteBuildLease: missing("renewSiteBuildLease"),
    recordSiteBuildAccepted: missing("recordSiteBuildAccepted"),
    recordSiteBuildTracking: missing("recordSiteBuildTracking"),
    recordSiteBuildSuccess: missing("recordSiteBuildSuccess"),
    recordSiteBuildFailure: missing("recordSiteBuildFailure"),
    completeTrackedSiteBuild: missing("completeTrackedSiteBuild"),
    claimTrackedSiteBuildChecks: missing("claimTrackedSiteBuildChecks"),
    recordTrackedSiteBuildCheck: missing("recordTrackedSiteBuildCheck"),
    ...overrides,
  };
}
