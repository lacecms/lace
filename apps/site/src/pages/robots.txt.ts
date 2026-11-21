import { robotsResponse } from "@lacecms/astro";
import { getSite } from "../lib/lace.js";

// Disallows everything when LACE_SITE_INDEXING=off, for staging and preview builds.
export async function GET(): Promise<Response> {
  const site = await getSite();
  return site.preview ? new Response(null, { status: 404 }) : robotsResponse(site);
}
