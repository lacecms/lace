import { sitemapResponse } from "@lacecms/astro";
import { getSite } from "../lib/lace";

// Written only when LACE_BUILD_SITE_URL is set; entries marked noindex are left out.
// Collections without a route never appear. Pass `{ include: (entry) => ... }`
// to list only entries whose route your site renders.
export async function GET(): Promise<Response> {
  return sitemapResponse(await getSite());
}
