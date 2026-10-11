import type { SiteBuildRecordDto } from "@lacecms/contracts";
import { isTerminalBuildStatus } from "../../entities/site-build/index.js";

/** The public-output change whose build is described: a publication or its removal. */
export type PublicationChange = "published" | "unpublished";

const changeLabel: Readonly<Record<PublicationChange, { done: string; noun: string }>> = {
  published: { done: "Published.", noun: "Publication" },
  unpublished: { done: "Unpublished.", noun: "Unpublication" },
};

/** Describes publication success separately from the build it may have requested. */
export function buildDispatchDescription(
  status: "queued" | "not-dispatched",
  change: PublicationChange = "published",
) {
  switch (status) {
    case "queued":
      return `${changeLabel[change].done} Build pending.`;
    case "not-dispatched":
      return `${changeLabel[change].noun} was already accepted; no new build was requested.`;
  }
}

/** A publication's build as known from persisted history, or not yet recorded. */
export type PublicationBuildState = SiteBuildRecordDto["status"] | "waiting";

/** Proven publication first, then work in progress, then unproven terminal outcomes. */
const coveringPrecedence = [
  "succeeded",
  "running",
  "pending",
  "accepted",
  "unknown",
  "cancelled",
  "failed",
] as const satisfies readonly SiteBuildRecordDto["status"][];

/**
 * Coalesced builds target the latest published version, so any build whose
 * target is at least the publication's version covers it.
 */
export function coveringBuildState(
  builds: readonly SiteBuildRecordDto[],
  publishedVersion: number,
): PublicationBuildState {
  const covering = builds.filter((build) => build.targetVersion >= publishedVersion);
  for (const status of coveringPrecedence)
    if (covering.some((build) => build.status === status)) return status;
  return "waiting";
}

export function isTerminalBuildState(state: PublicationBuildState) {
  return state !== "waiting" && isTerminalBuildStatus(state);
}

/** States only what persisted history shows; never claims a dev or manual deployment. */
export function publicationBuildDescription(
  state: PublicationBuildState,
  version: number,
  siteLabel?: string,
  change: PublicationChange = "published",
) {
  const build = `Build for version ${version}${siteLabel === undefined ? "" : ` of ${siteLabel}`}`;
  return `${changeLabel[change].done} ${buildStateSentence(state, build)}`;
}

function buildStateSentence(state: PublicationBuildState, build: string) {
  switch (state) {
    case "waiting":
      return `${build} is queued and not yet recorded.`;
    case "pending":
      return `${build} is pending (queued or waiting for a retry).`;
    case "running":
      return `${build} is running.`;
    case "accepted":
      return `${build} was accepted by the provider; Lace has not confirmed the site changed.`;
    case "succeeded":
      return `${build} succeeded.`;
    case "failed":
      return `${build} failed; the previous release stays served.`;
    case "cancelled":
      return `${build} was cancelled by the provider; the site was not updated by it.`;
    case "unknown":
      return `${build} has an unknown outcome; check the provider.`;
  }
}

/** Verified Step 29 behavior, shared by Builds and the introduction. */
export const publicationVisibilityModes = [
  {
    mode: "Drafts",
    detail: "Saving a draft never changes the site and never requests a build.",
  },
  {
    mode: "Astro dev",
    detail:
      "Reload to see published changes to existing pages. Restart dev for new or renamed URLs.",
  },
  {
    mode: "Manual static build",
    detail: "Run a fresh build after publishing, then deploy its output yourself.",
  },
  {
    mode: "Automatic builds",
    detail:
      "The site changes after a build covering the publication succeeds. A failed build keeps the previous release.",
  },
] as const;
