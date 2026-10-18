// Compiles `.astro` files so tests can render the adapter's components.
import { fileURLToPath } from "node:url";
import { getViteConfig } from "astro/config";

export default getViteConfig(
  {
    // Registry components outside this package import the adapter by name.
    resolve: {
      alias: [
        {
          find: /^@lacecms\/astro$/u,
          replacement: fileURLToPath(new URL("./dist/index.js", import.meta.url)),
        },
        {
          find: /^@lacecms\/astro\/(\w+\.astro)$/u,
          replacement: `${fileURLToPath(new URL("./dist/", import.meta.url))}$1`,
        },
      ],
    },
    test: { include: ["src/**/*.test.mjs"] },
  },
  // Image tests serve originals from a local server on a random port.
  { image: { remotePatterns: [{ hostname: "127.0.0.1", protocol: "http" }] }, logLevel: "error" },
);
