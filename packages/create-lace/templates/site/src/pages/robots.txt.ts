import { robotsResponse } from "@lacecms/astro";
import { getSite } from "../lib/lace";

// Names the sitemap; disallows everything when LACE_SITE_INDEXING=off (staging).
export async function GET(): Promise<Response> {
  return robotsResponse(await getSite());
}
