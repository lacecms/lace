import { createAstroSiteLoader } from "@lacecms/astro";

const onLinkDiagnostics = (diagnostics: import("@lacecms/sdk").LinkDiagnostics) => {
  if (diagnostics.total > 0) console.warn("[lace] Unavailable internal links", diagnostics);
};

export const getSite = createAstroSiteLoader({
  onLinkDiagnostics,
  env: { ...import.meta.env, ...process.env },
  dev: import.meta.env.DEV,
});
