import { defineCollection } from "astro:content";
import { z } from "astro/zod";
import { docsLoader } from "@astrojs/starlight/loaders";
import { docsSchema } from "@astrojs/starlight/schema";
export const collections = {
  docs: defineCollection({
    loader: docsLoader(),
    schema: docsSchema({
      extend: z.object({
        /** Page shape enforced by scripts/check.mjs. */
        kind: z.enum(["overview", "guide", "reference"]),
        /** Lace release this page was last checked against; see scripts/check.mjs. */
        verifiedAgainst: z.string(),
      }),
    }),
  }),
};
