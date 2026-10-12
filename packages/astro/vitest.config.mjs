// Compiles `.astro` files so tests can render the adapter's components.
import { getViteConfig } from "astro/config";

export default getViteConfig({ test: { include: ["src/**/*.test.mjs"] } }, { logLevel: "error" });
