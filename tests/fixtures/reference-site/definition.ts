import { defineBlock, field } from "@lacecms/content";

export const selection = defineBlock({
  type: "selection",
  version: 1,
  fields: {
    reviews: field.list({ item: field.reference({ models: ["testimonials"] }), maxItems: 3 }),
    author: field.reference({ models: ["authors"] }),
  },
});
