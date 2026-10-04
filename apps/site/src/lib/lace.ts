import { createAstroSiteLoader } from "@lacecms/astro";
import type { LaceFetch } from "@lacecms/sdk";
import fixtureExport from "../fixtures/published-export.json" with { type: "json" };

const DEFAULT_API_BASE_URL = "https://cms.example.test/lace";

const env: Readonly<Record<string, string | undefined>> = { ...import.meta.env, ...process.env };
const mode = env.LACE_SITE_DATA_MODE ?? "fixture";
if (mode !== "fixture" && mode !== "live")
  throw new TypeError("LACE_SITE_DATA_MODE must be fixture or live.");

// Fixture mode runs the same loader against the committed export without a request.
const fixtureFetch: LaceFetch = async () =>
  Response.json(fixtureExport, { headers: { etag: `"${fixtureExport.version}"` } });

const hints = {
  missing_configuration:
    "Create a read-only build token through POST /api/v1/admin/api-tokens, set LACE_SITE_DATA_MODE=live, LACE_API_BASE_URL and LACE_BUILD_TOKEN in the ignored .env, and restart the site.",
  rejected_token:
    "Create or replace the read-only build token through POST /api/v1/admin/api-tokens, update the ignored .env, and restart the site.",
  api_unavailable: "Check that `pnpm dev:node` has started the API.",
};

export const getSite =
  mode === "fixture"
    ? createAstroSiteLoader({
        env: {
          LACE_API_BASE_URL: env.LACE_API_BASE_URL ?? DEFAULT_API_BASE_URL,
          LACE_BUILD_TOKEN: "fixture",
          LACE_PUBLIC_BASE_URL: env.LACE_PUBLIC_BASE_URL,
        },
        fetch: fixtureFetch,
        hints,
      })
    : createAstroSiteLoader({ env, dev: import.meta.env.DEV, hints });
