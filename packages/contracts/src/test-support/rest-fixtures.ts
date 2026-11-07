import {
  actorId,
  blockKey,
  contentEntryId,
  contentSnapshotId,
  unixMilliseconds,
} from "@lacecms/domain";

export const timestamp = unixMilliseconds(1_735_689_600_000);
export const actor = { id: actorId("actor-1"), role: "admin" };
export const block = {
  data: { heading: "Welcome" },
  hidden: false,
  key: blockKey("hero-1"),
  position: 1_000,
  schemaVersion: 1,
  settings: {},
  type: "hero",
};
export const draft = {
  blocks: [block],
  createdAt: timestamp,
  entryId: contentEntryId("entry-1"),
  fields: { author: "Lace" },
  id: contentSnapshotId("snapshot-draft-1"),
  revision: 4,
  slug: "welcome",
  state: "draft",
  title: "Welcome",
  updatedAt: timestamp,
  updatedBy: actor,
};
export const published = {
  ...draft,
  id: contentSnapshotId("snapshot-published-1"),
  state: "published",
};
export const entry = {
  draft,
  id: contentEntryId("entry-1"),
  model: { key: "posts", kind: "collection", route: "/blog/:slug" },
  published,
};
