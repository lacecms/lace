import type { SiteBuildRecordDto } from "@lacecms/contracts";
export const buildFailureGuidance: Record<
  NonNullable<SiteBuildRecordDto["error"]>,
  { explanation: string; correction: string }
> = {
  source_symlink: {
    explanation: "The source contains a symbolic link.",
    correction: "Replace the included link with a regular source entry, then retry the build.",
  },
  source_unreadable: {
    explanation: "The builder cannot read a source entry.",
    correction:
      "Restore read access to the entry and traverse access to its parents for the builder user, then retry.",
  },
  source_missing: {
    explanation: "A required source entry is missing.",
    correction: "Restore the required entry in the selected installation, then retry.",
  },
  source_special_file: {
    explanation: "The source contains an unsupported special file.",
    correction: "Remove it or replace it with a regular file or directory, then retry.",
  },
  source_invalid: {
    explanation: "The selected source is invalid.",
    correction:
      "Check the source, project and output selection, root manifests and selected Astro dependency against the documented layout.",
  },
  install_failed: {
    explanation: "Dependency installation failed.",
    correction:
      "Check that the root frozen lockfile matches package manifests and that dependencies are available to the builder, then retry.",
  },
  build_failed: {
    explanation: "The Astro build failed.",
    correction:
      "Run the selected Astro build locally, correct the site or build output, then retry.",
  },
  version_changed: {
    explanation: "Published content changed during the build.",
    correction: "Request a build of the latest published version after publication settles.",
  },
  trigger_unavailable: {
    explanation: "The build trigger is unavailable.",
    correction:
      "Check private builder or provider connectivity and deployment credentials, then retry.",
  },
  build_timeout: {
    explanation: "The build timed out.",
    correction: "Check builder or provider availability and build duration before retrying.",
  },
  invalid_build_event: {
    explanation: "The queued build event is invalid.",
    correction:
      "Check matched engine versions and ask the operator to inspect the correlated queue event.",
  },
  provider_failed: {
    explanation: "The build provider failed.",
    correction:
      "Ask the operator to inspect private builder or provider logs using the build ID, then retry after correction.",
  },
  provider_build_failed: {
    explanation: "The Cloudflare Pages build of the static site failed.",
    correction:
      "Open the deployment's build log in Cloudflare Pages, correct the site or its build settings, then retry the build.",
  },
  provider_deploy_failed: {
    explanation: "Cloudflare Pages built the site but failed to deploy it.",
    correction:
      "Check the deployment in Cloudflare Pages; the previous deployment stays live. Retry the build when Pages is healthy.",
  },
  provider_cancelled: {
    explanation: "The deployment was cancelled in Cloudflare Pages.",
    correction: "Retry the build if the published content should still be deployed.",
  },
  provider_skipped: {
    explanation: "Cloudflare Pages skipped the deployment.",
    correction:
      "Check the project's build watch paths and branch controls in Cloudflare Pages, then retry the build.",
  },
  tracking_forbidden: {
    explanation: "Lace may not read this Cloudflare Pages deployment.",
    correction:
      "Give LACE_PAGES_API_TOKEN the Account · Cloudflare Pages · Read permission for this account, check the deployment in Pages, then retry if needed.",
  },
  tracking_not_found: {
    explanation: "Cloudflare Pages does not know this deployment.",
    correction:
      "Check LACE_PAGES_ACCOUNT_ID and LACE_PAGES_PROJECT_NAME match the project of the deploy hook, then retry the build.",
  },
  tracking_rejected: {
    explanation: "Cloudflare Pages rejected the deployment status request.",
    correction:
      "Check the Pages tracking settings of the CMS Worker, then check the deployment in Pages and retry if needed.",
  },
  tracking_timeout: {
    explanation: "Tracking stopped at its deadline before the deployment finished.",
    correction:
      "Check the deployment in Cloudflare Pages and retry if it did not publish; for long build queues raise LACE_PAGES_TRACKING_TIMEOUT_MINUTES.",
  },
  tracking_unconfigured: {
    explanation: "Pages tracking settings were removed while this deployment was tracked.",
    correction:
      "Check the deployment in Cloudflare Pages, then retry the build if needed; restore the tracking settings to track new builds.",
  },
};
