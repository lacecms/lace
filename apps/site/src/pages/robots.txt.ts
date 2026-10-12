import { robotsResponse } from "@lacecms/astro";
import { getSite } from "../lib/lace.js";

// Disallows everything when LACE_SITE_INDEXING=off, for staging and preview builds.
export async function GET(): Promise<Response> {
  return robotsResponse(await getSite());
}
