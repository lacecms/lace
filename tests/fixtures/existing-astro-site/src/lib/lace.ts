import { createAstroSiteLoader } from "@lacecms/astro";

export const getSite = createAstroSiteLoader({
  env: { ...import.meta.env, ...process.env },
  dev: import.meta.env.DEV,
});
