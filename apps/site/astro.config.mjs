import { defineConfig } from "astro/config";
import { fileURLToPath } from "node:url";
import { runnerImport } from "vite";
import { laceImageConfig } from "../../packages/astro/src/media/images.ts";

// Resolve workspace packages from a committed checkout without compiled dist files.
const source = (path) => fileURLToPath(new URL(`../../packages/${path}`, import.meta.url));
const resolve = {
  alias: [
    ...["astro", "render", "sdk", "contracts", "content", "domain"].map((name) => ({
      find: new RegExp(`^@lacecms/${name}$`, "u"),
      replacement: source(`${name}/src/index.ts`),
    })),
    ...["astro", "sdk", "contracts"].map((name) => ({
      find: `@lacecms/${name}/preview`,
      replacement: source(`${name}/src/preview.ts`),
    })),
    {
      find: /^@lacecms\/astro\/(\w+\.astro)$/u,
      replacement: source("astro/src/") + "$1",
    },
  ],
};

const integrations = [];
if (process.env.LACE_PREVIEW_INPUT_FILE !== undefined) {
  // Astro's initial config loader runs before it has the site's Vite aliases.
  const { module } = await runnerImport(source("astro/src/preview/integration.ts"), { resolve });
  integrations.push(module.lacePreview());
}

export default defineConfig({
  image: laceImageConfig(process.env),
  integrations,
  output: "static",
  vite: {
    server: { allowedHosts: ["site"] },
    resolve,
  },
});
