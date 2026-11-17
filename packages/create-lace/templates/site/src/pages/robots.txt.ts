import { robotsResponse } from "@lacecms/astro";
import { getSite } from "../lib/lace";

// Names the sitemap; disallows everything when LACE_SITE_INDEXING=off (staging).
export async function GET(): Promise<Response> {
  const site = await getSite();
  return site.preview ? new Response(null, { status: 404 }) : robotsResponse(site);
}
