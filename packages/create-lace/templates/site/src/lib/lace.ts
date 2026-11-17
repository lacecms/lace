import { createAstroPreviewSiteLoader } from "@lacecms/astro/preview";

const onLinkDiagnostics = (diagnostics: import("@lacecms/sdk").LinkDiagnostics) => {
  if (diagnostics.total > 0) console.warn("[lace] Unavailable internal links", diagnostics);
};

// Server-only. Ordinary builds read the published export; the preview runner
// supplies frozen input for one saved route. Astro dev revalidates publication.
export const getSite = createAstroPreviewSiteLoader({
  onLinkDiagnostics,
  env: { ...import.meta.env, ...process.env },
  dev: import.meta.env.DEV,
  hints: {
    missing_configuration:
      "Create a read-only build token in Admin Settings, set it in the ignored .env, and restart the site.",
    rejected_token:
      "Create or replace the read-only build token in Admin Settings, update the ignored .env, and restart the site.",
    api_unavailable: "Check that `pnpm dev:api` has started the API.",
  },
});
