import { sitemapResponse } from "@lacecms/astro";
import { getSite } from "../lib/lace";

// Written only when LACE_BUILD_SITE_URL is set; entries marked noindex are left out.
// Pass `{ include: (entry) => ... }` to list only entries that have a route here.
export async function GET(): Promise<Response> {
  return sitemapResponse(await getSite());
}
