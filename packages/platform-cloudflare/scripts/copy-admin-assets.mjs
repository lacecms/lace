import { access, cp, rm } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Packages the compiled admin of the same source revision for the Workers
 * static-assets binding. A missing admin build only warns so pnpm-filtered
 * builds that never pack keep working; release verification and the Cloudflare
 * consumer acceptance require `admin/index.html`.
 */
const source = fileURLToPath(new URL("../../../apps/admin/dist/", import.meta.url));
const destination = fileURLToPath(new URL("../admin/", import.meta.url));

await rm(destination, { force: true, recursive: true });
try {
  await access(join(source, "index.html"));
} catch {
  console.warn(
    "apps/admin/dist is missing; @lacecms/platform-cloudflare is built without packaged admin assets.",
  );
  process.exit(0);
}
await cp(source, destination, { recursive: true });
