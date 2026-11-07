import { expect, test } from "vitest";
import { siteBuildFailureReasons, sourceFailureReasons } from "./diagnostics.js";
import {
  isRetryableSiteBuildStatus,
  isSiteBuildProviderStage,
  isSiteBuildStatus,
  isTerminalSiteBuildStatus,
  normalizeTrackedOutcomeReason,
  retryableSiteBuildStatuses,
  siteBuildProviderStages,
  siteBuildStatuses,
  terminalSiteBuildStatuses,
  trackedOutcomeReasons,
  trackedSiteBuildOutcomes,
} from "./status.js";

test("site-build statuses form one closed lifecycle with explicit terminal and retry sets", () => {
  expect(siteBuildStatuses).toEqual([
    "pending",
    "running",
    "accepted",
    "succeeded",
    "failed",
    "cancelled",
    "unknown",
  ]);
  expect(siteBuildStatuses.filter(isTerminalSiteBuildStatus)).toEqual([
    ...terminalSiteBuildStatuses,
  ]);
  expect(isTerminalSiteBuildStatus("pending")).toBe(false);
  expect(isTerminalSiteBuildStatus("running")).toBe(false);
  expect(siteBuildStatuses.filter(isRetryableSiteBuildStatus).sort()).toEqual(
    [...retryableSiteBuildStatuses].sort(),
  );
  expect(isRetryableSiteBuildStatus("succeeded")).toBe(false);
  expect(trackedSiteBuildOutcomes).toEqual(["succeeded", "failed", "cancelled", "unknown"]);
  expect(isSiteBuildStatus("accepted")).toBe(true);
  expect(isSiteBuildStatus("deployed")).toBe(false);
});

test("tracked outcomes keep only their own closed reasons and stages are closed", () => {
  for (const reasons of Object.values(trackedOutcomeReasons))
    for (const reason of reasons) expect(siteBuildFailureReasons).toContain(reason);
  expect(sourceFailureReasons).not.toContain("provider_build_failed");
  expect(normalizeTrackedOutcomeReason("failed", "provider_deploy_failed")).toBe(
    "provider_deploy_failed",
  );
  expect(normalizeTrackedOutcomeReason("failed", "secret text")).toBe("provider_failed");
  expect(normalizeTrackedOutcomeReason("failed", undefined)).toBe("provider_failed");
  expect(normalizeTrackedOutcomeReason("cancelled", "provider_skipped")).toBe("provider_skipped");
  expect(normalizeTrackedOutcomeReason("cancelled", "tracking_timeout")).toBeUndefined();
  expect(normalizeTrackedOutcomeReason("unknown", "tracking_timeout")).toBe("tracking_timeout");
  expect(normalizeTrackedOutcomeReason("unknown", "provider_build_failed")).toBeUndefined();
  expect(normalizeTrackedOutcomeReason("succeeded", "provider_failed")).toBeUndefined();
  expect(siteBuildProviderStages).toEqual([
    "queued",
    "initialize",
    "clone_repo",
    "build",
    "deploy",
  ]);
  expect(isSiteBuildProviderStage("deploy")).toBe(true);
  expect(isSiteBuildProviderStage("upload")).toBe(false);
});
