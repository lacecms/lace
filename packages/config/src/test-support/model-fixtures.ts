import { builtInBlocks, field } from "@lacecms/content";

import { defineCollection, defineGlobal, definePage } from "../index.js";

export const blocks = Object.values(builtInBlocks);

// Negative tests pass malformed DSL overrides through unknown to exercise runtime validation.
export function postModel(overrides: unknown = {}) {
  return defineCollection({
    blocks: ["richText", "image"],
    fields: {
      author: field.text(),
      publishedAt: field.date({ required: true }),
    },
    key: "posts",
    label: "Posts",
    route: "/blog/:slug",
    version: 1,
    ...(overrides as Record<string, unknown>),
  });
}

export function homeModel(overrides: unknown = {}) {
  return definePage({
    blocks: ["hero"],
    fields: { heading: field.text({ label: "Heading", required: true }) },
    key: "home",
    label: "Home",
    path: "/",
    version: 1,
    ...(overrides as Record<string, unknown>),
  });
}

export const seoFields = {
  body: field.richText(),
  cover: field.media(),
  excerpt: field.textarea(),
  heading: field.text(),
};

export function seoCollection(overrides: unknown = {}) {
  return defineCollection({
    fields: seoFields,
    key: "posts",
    route: "/blog/:slug",
    version: 1,
    ...(overrides as Record<string, unknown>),
  });
}

export function settingsGlobal(overrides: unknown = {}) {
  return defineGlobal({
    fields: {
      metaDescription: field.textarea(),
      shareImage: field.media(),
      siteName: field.text({ required: true }),
      titleTemplate: field.text(),
    },
    key: "settings",
    version: 1,
    ...(overrides as Record<string, unknown>),
  });
}
