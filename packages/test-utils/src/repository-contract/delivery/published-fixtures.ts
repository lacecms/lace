import { blockKey, mediaId } from "@lacecms/domain";
import type { ContractModelKey, ContractRepository, ContractSql } from "../shared.js";
import { entry, heroBlock, publish, save, seedMedia, seedModels } from "../shared.js";

export const publishedSubjectId = "subject";
export const publishedSubjectPath = "/blog/stable";

function values(version: "old" | "new" | "draft", model: ContractModelKey) {
  const image = `image-${version}`;
  const target = version === "old" ? "target-old" : "target-new";
  const keys = version === "old" ? ["alpha", "beta"] : ["beta", "alpha"];
  return {
    blocks: [
      ...keys.map((key, index) => ({
        ...heroBlock(key, image, `${version} ${key}`, "hero", (index + 1) * 1000),
        settings: { note: version },
      })),
      { ...heroBlock("hidden", "image-hidden", "hidden payload", "hero", 3000), hidden: true },
    ],
    fields: { image, url: `entry:${target}`, text: `${version} fields` },
    ...(model === "posts" ? { slug: "stable" } : {}),
    title: `${version} title`,
  };
}

function references(version: "old" | "new" | "draft") {
  return {
    internalLinks: [
      {
        sourceKey: "$fields",
        area: "fields" as const,
        pointer: "/url",
        targetId: version === "old" ? "target-old" : "target-new",
        delivered: true,
      },
    ],
    mediaReferences: [
      { sourceKey: "$fields" as const, fieldPath: "image", mediaId: mediaId(`image-${version}`) },
      { sourceKey: blockKey("hidden"), fieldPath: "image", mediaId: mediaId("image-hidden") },
    ],
  };
}

export async function seedPublishedSubject(
  writer: ContractRepository,
  sql: ContractSql,
  model: ContractModelKey,
) {
  await seedModels(sql, "posts", ...(model === "posts" ? [] : [model]));
  for (const version of ["old", "new", "draft", "hidden", "unrelated"])
    await seedMedia(sql, `image-${version}`);
  for (const id of ["target-old", "target-new"]) {
    await writer.create({
      entry: entry(id, "posts", { slug: id, updatedAt: 1 }),
      mediaReferences: [],
    });
    await writer.publish(publish(id, 1, 2));
  }
  await writer.create({
    entry: entry(publishedSubjectId, model, { ...values("old", model), updatedAt: 3 }),
    ...references("old"),
  });
  await writer.publish(publish(publishedSubjectId, 1, 10));
}

export async function stageNewPublication(writer: ContractRepository, model: ContractModelKey) {
  const { internalLinks, mediaReferences } = references("new");
  await writer.saveCompleteDraft({
    ...save(publishedSubjectId, 1, 11, { ...values("new", model), mediaReferences }),
    internalLinks,
  });
  return () => writer.publish(publish(publishedSubjectId, 2, 30));
}

export async function saveDraftOnlyValues(writer: ContractRepository, model: ContractModelKey) {
  const { internalLinks, mediaReferences } = references("draft");
  await writer.saveCompleteDraft({
    ...save(publishedSubjectId, 2, 40, { ...values("draft", model), mediaReferences }),
    internalLinks,
  });
}

export async function stageLargeDraft(writer: ContractRepository, revision: number) {
  const { internalLinks, mediaReferences } = references("draft");
  const payload = "draft-only-é".repeat(256);
  await writer.saveCompleteDraft({
    ...save(publishedSubjectId, revision, 40, {
      ...values("draft", "posts"),
      blocks: Array.from({ length: 64 }, (_, index) =>
        heroBlock(`draft-only-${index}`, "image-draft", payload, "hero", (index + 1) * 1000),
      ),
      fields: { image: "image-draft", text: payload.repeat(64) },
      mediaReferences,
    }),
    internalLinks,
  });
}
