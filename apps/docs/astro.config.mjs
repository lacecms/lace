import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";
import catalog from "./src/catalog.mjs";
export default defineConfig({
  site: "https://lacecms.github.io",
  base: "/lace",
  output: "static",
  trailingSlash: "always",
  integrations: [
    starlight({
      title: "Lace",
      description: "A lightweight, self-hosted headless CMS for Astro websites.",
      defaultLocale: catalog.defaultLocale,
      locales: catalog.locales,
      social: [{ icon: "github", label: "GitHub", href: "https://github.com/lacecms/lace" }],
      editLink: { baseUrl: "https://github.com/lacecms/lace/edit/main/apps/docs/" },
      customCss: ["./src/styles/docs.css"],
      components: {
        Head: "./src/components/Head.astro",
        LanguageSelect: "./src/components/LanguageSelect.astro",
      },
      sidebar: Object.entries(catalog.versions).flatMap(([version, definition]) => [
        { label: `${definition.label} · ${definition.target}`, link: `${version}/` },
        ...Object.entries(catalog.sections).map(([section, label]) => ({
          label,
          items: [{ autogenerate: { directory: `${version}/${section}` } }],
        })),
      ]),
    }),
  ],
});
