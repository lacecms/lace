import { defineConfig } from "astro/config";
import { fileURLToPath } from "node:url";
// The adapter's source, like the aliases below; Astro loads the config through Vite.
import { laceImageConfig } from "../../packages/astro/src/images.ts";

export default defineConfig({
  // Lets the build fetch media originals from the API for image variants.
  image: laceImageConfig(process.env),
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
