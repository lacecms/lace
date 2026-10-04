import { createCloudflareWorker } from "@lacecms/platform-cloudflare";
import config from "../lace.config.ts";

/** Lace CMS Worker: the project configuration is bundled, never loaded per request. */
export default createCloudflareWorker({ config });
