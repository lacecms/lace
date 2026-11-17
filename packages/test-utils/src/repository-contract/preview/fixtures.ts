import type { AdmitPreview } from "@lacecms/application";
import { unixMilliseconds } from "@lacecms/domain";
import { editor, entry, resolveRoute, seedModels } from "../shared.js";
import type { ContractRepository, RepositoryContractRuntime } from "../shared.js";

export async function openPreview(runtime: RepositoryContractRuntime) {
  const harness = await runtime.open({ resolveModel: resolveRoute });
  await seedModels(harness.sql, "home", "posts", "settings", "testimonials");
  const target = entry("target", "home", { updatedAt: 1, fields: { text: "saved" } });
  const other = entry("other", "posts", { updatedAt: 1, slug: "other" });
  for (const draft of [target, other])
    await harness.repository.create({ entry: draft, mediaReferences: [] });
  return { ...harness, target, other };
}

export async function previewInput(
  repository: ContractRepository,
  target: ReturnType<typeof entry>,
  id: string,
  now = 100,
): Promise<AdmitPreview> {
  return {
    ...(await repository.preview.previewCaptureFence()),
    id,
    actorId: editor.id,
    entryId: target.id,
    expectedRevision: target.draft.revision,
    draftSnapshotId: target.draft.id,
    idempotencyKey: id,
    modelKey: target.model.key,
    path: target.model.kind === "page" ? "/" : `/blog/${target.draft.slug}`,
    projection: {
      fields: target.draft.fields,
      blocks: target.draft.blocks,
      mediaReferences: [],
      internalLinks: [],
    },
    source: { commit: "a".repeat(40), executor: "fixture" },
    now: unixMilliseconds(now),
  };
}

export const previewManifest = { sha256: "a".repeat(64), bytes: 10 };
export const previewOutput = { sha256: "b".repeat(64), bytes: 11 };

export async function beginPreview(
  repository: ContractRepository,
  target: ReturnType<typeof entry>,
  id: string,
) {
  const input = await previewInput(repository, target, id);
  const receipt = await repository.preview.admitPreview(input);
  if (
    receipt.kind !== "admitted" ||
    !(await repository.preview.sealPreviewInput(id, previewManifest, unixMilliseconds(110)))
  )
    throw new Error("Expected a sealed preview fixture.");
  return { generation: receipt.generation, input, claim: previewClaim(input) };
}

export function previewClaim(input: AdmitPreview, now = 120) {
  return {
    id: input.id,
    executor: input.source.executor,
    commit: input.source.commit,
    run: `run-${input.id}`,
    credentialHash: "c".repeat(64),
    now: unixMilliseconds(now),
  };
}
