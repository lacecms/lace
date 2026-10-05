import { expect, test } from "vitest";
import {
  buildStatusTourSummary,
  isRetryableBuildStatus,
  isTerminalBuildStatus,
  siteBuildStatusGuidance,
  siteBuildStatuses,
} from "./index.js";

test("the status map covers exactly the contract vocabulary", () => {
  expect(Object.keys(siteBuildStatusGuidance).sort()).toEqual([...siteBuildStatuses].sort());
  expect(siteBuildStatuses).toHaveLength(7);
  for (const status of siteBuildStatuses) {
    const guidance = siteBuildStatusGuidance[status];
    expect(guidance.meaning.length).toBeGreaterThan(0);
    expect(guidance.proof.length).toBeGreaterThan(0);
    expect(guidance.next.length).toBeGreaterThan(0);
  }
});

test("only succeeded claims publication", () => {
  for (const status of siteBuildStatuses) {
    const claimsPublication = /serves content|was published/u.test(
      `${siteBuildStatusGuidance[status].meaning} ${siteBuildStatusGuidance[status].proof}`,
    );
    expect(claimsPublication, status).toBe(status === "succeeded");
  }
});

test("terminal and retryable sets follow the lifecycle", () => {
  expect(siteBuildStatuses.filter(isTerminalBuildStatus)).toEqual([
    "accepted",
    "succeeded",
    "failed",
    "cancelled",
    "unknown",
  ]);
  expect(siteBuildStatuses.filter(isRetryableBuildStatus)).toEqual([
    "accepted",
    "failed",
    "cancelled",
    "unknown",
  ]);
});

test("the tour summary names every status from the same map", () => {
  const summary = buildStatusTourSummary();
  for (const status of siteBuildStatuses)
    expect(summary).toContain(siteBuildStatusGuidance[status].label);
  expect(summary).toContain("Only Succeeded proves the site was published");
});
