import { defineCollection, defineConfig, defineGlobal, definePage } from "@lacecms/config";
import { builtInBlocks, field } from "@lacecms/content";

export default await defineConfig({
  blocks: [
    builtInBlocks.hero,
    builtInBlocks.richText,
    builtInBlocks.image,
    builtInBlocks.quote,
    builtInBlocks.cta,
  ],
  content: [
    definePage({
      key: "home",
      version: 1,
      label: "Home",
      path: "/",
      blocks: ["hero", "richText", "image", "quote", "cta"],
      seo: true,
    }),
    defineCollection({
      key: "posts",
      version: 1,
      label: "Posts",
      route: "/blog/:slug",
      fields: { summary: field.text() },
      blocks: ["hero", "richText", "image", "quote", "cta"],
      seo: { description: "summary" },
    }),
    defineGlobal({
      key: "settings",
      version: 1,
      label: "Site settings",
      description: "Site name, tagline and the search and social defaults of every page.",
      fields: {
        siteName: field.text({ label: "Site name", required: true }),
        tagline: field.text({ label: "Tagline" }),
        description: field.textarea({ label: "Site description" }),
        image: field.media({ label: "Share image" }),
      },
      seoDefaults: { siteName: "siteName", description: "description", image: "image" },
    }),
  ],
});
