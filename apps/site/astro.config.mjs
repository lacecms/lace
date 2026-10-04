import { defineConfig } from "astro/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  output: "static",
  vite: {
    server: { allowedHosts: ["site"] },
    // The reference workspace uses source packages. Direct Astro builds must
    // not depend on old dist files or invoke dependency package build scripts.
    // Component subpaths such as `@lacecms/astro/LaceBlocks.astro` resolve to
    // the adapter's source components for the same reason.
    resolve: {
      alias: [
        ...["astro", "render", "sdk", "contracts", "content", "domain"].map((name) => ({
          find: new RegExp(`^@lacecms/${name}$`, "u"),
          replacement: fileURLToPath(
            new URL(`../../packages/${name}/src/index.ts`, import.meta.url),
          ),
        })),
        {
          find: /^@lacecms\/astro\/(\w+\.astro)$/u,
          replacement: `${fileURLToPath(new URL("../../packages/astro/src/", import.meta.url))}$1`,
        },
      ],
    },
  },
});
