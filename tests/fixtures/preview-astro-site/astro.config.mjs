import { lacePreview } from "@lacecms/astro/preview";
import { defineConfig } from "astro/config";

export default defineConfig({
  base: "/journal/",
  output: "static",
  integrations: [lacePreview()],
  vite: { build: { assetsInlineLimit: 0 } },
});
