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
      version: 4,
      label: "Home",
      path: "/",
      blocks: ["hero", "richText", "image", "quote", "cta"],
      seo: true,
    }),
    definePage({
      key: "about",
      version: 3,
      label: "About",
      path: "/about",
      blocks: ["hero", "richText", "image", "quote", "cta"],
      seo: true,
    }),
    defineCollection({
      key: "posts",
      version: 4,
      label: "Posts",
      route: "/blog/:slug",
      fields: {
        author: field.text(),
        category: field.select({ options: ["engineering", "design", "news"] }),
        publishedAt: field.date({ required: true }),
      },
      listFields: ["category", "author"],
      blocks: ["hero", "richText", "image", "quote", "cta"],
      seo: true,
    }),
    defineCollection({
      key: "notes",
      version: 3,
      label: "Notes",
      route: "/notes/:slug",
      fields: { summary: field.text() },
      blocks: ["hero", "richText", "image", "quote", "cta"],
      seo: { description: "summary" },
    }),
    defineGlobal({
      key: "settings",
      version: 2,
      label: "Site settings",
      description: "Site name, tagline and the search and social defaults of every page.",
      fields: {
        siteName: field.text({ label: "Site name", required: true }),
        tagline: field.text({ label: "Tagline" }),
        titleTemplate: field.text({
          label: "Title template",
          description: "Page titles use it; %s stands for the page title.",
        }),
        description: field.textarea({ label: "Site description" }),
        image: field.media({ label: "Share image" }),
      },
      seoDefaults: {
        siteName: "siteName",
        titleTemplate: "titleTemplate",
        description: "description",
        image: "image",
      },
    }),
  ],
});
