import { builtInBlocks, field } from "@lacecms/content";
import { defineCollection, defineConfig, definePage } from "./index.js";

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
      blocks: ["hero", "richText", "image", "quote", "cta"],
      key: "home",
      label: "Home",
      path: "/",
      version: 4,
    }),
    defineCollection({
      blocks: ["hero", "richText", "image", "quote", "cta"],
      fields: {
        author: field.text(),
        category: field.select({ options: ["engineering", "design", "news"] }),
        publishedAt: field.date({ required: true }),
      },
      key: "posts",
      label: "Posts",
      route: "/blog/:slug",
      version: 4,
    }),
  ],
});
