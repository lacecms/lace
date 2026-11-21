import { sitemapResponse } from "@lacecms/astro";
import { getSite } from "../lib/lace.js";

// Written only when LACE_BUILD_SITE_URL is set; entries marked noindex are left out.
export async function GET(): Promise<Response> {
  const site = await getSite();
  return site.preview ? new Response(null, { status: 404 }) : sitemapResponse(site);
}
