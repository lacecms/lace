import { createAstroSiteLoader } from "@lacecms/astro";

// Server-only: the loader reads LACE_BUILD_TOKEN. Astro dev revalidates the
// export on every request; a static build reads it once.
export const getSite = createAstroSiteLoader({
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
