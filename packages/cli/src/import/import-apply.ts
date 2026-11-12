import { createHash } from "node:crypto";
import {
  adminContentEntrySchema,
  mediaDetailSchema,
  mediaEntityTag,
  mediaMetadataSchema,
  publishContentEntryResultSchema,
  updateMediaMetadataResultSchema,
} from "@lacecms/contracts";
import type { ImportClient } from "./import-client.js";
import { readVerifiedMedia } from "./import-files.js";
import type { MediaMetadataPatch } from "./import-files.js";
import { draftProjection, idResolver, resolvedCandidate } from "./import-plan.js";
import type { AdminEntry, ImportPlan } from "./import-plan.js";
import type { ImportState } from "./import-state.js";
import { draftInput } from "./import-validate.js";
import type { ValidatedPackage } from "./import-validate.js";

const API = "/api/v1/admin";

export interface ApplySummary {
  uploaded: number;
  mediaUpdated: number;
  created: number;
  saved: number;
  published: number;
}

/** Deterministic publication idempotency key: printable ASCII, at most 255 characters. */
export function publicationKey(entryId: string, revision: number): string {
  const key = `lace-import:${encodeURIComponent(entryId)}:${revision}`;
  return key.length <= 255 ? key : `lace-import:${createHash("sha256").update(key).digest("hex")}`;
}

async function patchMedia(
  client: ImportClient,
  key: string,
  mediaId: string,
  changes: MediaMetadataPatch,
): Promise<void> {
  const current = await client.request({
    method: "GET",
    path: `${API}/media/${encodeURIComponent(mediaId)}`,
    what: `Reading media "${key}"`,
    schema: mediaDetailSchema,
    expect: [200],
  });
  // The precondition is derived from the body, never the ETag response header:
  // compressing proxies such as Cloudflare weaken strong ETags to `W/"…"`,
  // which the media If-Match precondition refuses.
  await client.request({
    method: "PATCH",
    path: `${API}/media/${encodeURIComponent(mediaId)}`,
    what: `Updating media "${key}"`,
    json: changes,
    headers: { "if-match": mediaEntityTag(Date.parse(current.body.updatedAt)) },
    schema: updateMediaMetadataResultSchema,
    expect: [200],
  });
}

/**
 * Performs the planned writes one at a time and records each in the state
 * file. Never deletes or unpublishes. A failure stops the run; a rerun
 * resumes from server lookups.
 */
export async function applyPlan(
  client: ImportClient,
  state: ImportState,
  validated: ValidatedPackage,
  plan: ImportPlan,
): Promise<ApplySummary> {
  const summary: ApplySummary = {
    uploaded: 0,
    mediaUpdated: 0,
    created: 0,
    saved: 0,
    published: 0,
  };
  const mediaIds = new Map<string, string>();
  for (const item of plan.media) {
    let mediaId = item.sameAs === undefined ? item.mediaId : mediaIds.get(item.sameAs);
    if (item.action === "upload") {
      const form = new FormData();
      const bytes = await readVerifiedMedia(item.key, item.file);
      form.append("file", new Blob([bytes], { type: item.file.mimeType }), item.file.filename);
      for (const tag of item.metadata.tags ?? []) form.append("tags", tag);
      const { body } = await client.request({
        method: "POST",
        path: `${API}/media`,
        what: `Uploading media "${item.key}"`,
        form,
        schema: mediaMetadataSchema,
        expect: [201],
      });
      mediaId = body.id;
      summary.uploaded += 1;
      const { tags: _tags, ...rest } = item.metadata;
      state.setMedia(item.key, { id: mediaId, sha256: item.file.sha256 });
      await state.save();
      if (Object.keys(rest).length > 0) await patchMedia(client, item.key, mediaId, rest);
    } else if (item.action === "update") {
      await patchMedia(client, item.key, mediaId!, item.changes);
      summary.mediaUpdated += 1;
    }
    mediaIds.set(item.key, mediaId!);
    state.setMedia(item.key, { id: mediaId!, sha256: item.file.sha256 });
    await state.save();
  }

  const current = new Map<string, AdminEntry>();
  const entryIds = new Map<string, string>();
  for (const entry of plan.entries)
    if (entry.current !== undefined) {
      current.set(entry.key, entry.current);
      entryIds.set(entry.key, entry.current.id);
    }
  const record = async (key: string, model: string, entry: AdminEntry) => {
    current.set(key, entry);
    entryIds.set(key, entry.id);
    state.setEntry(key, { id: entry.id, model, revision: entry.draft.revision });
    await state.save();
  };

  // Pass 1: create missing collection entries; links to entries created later are omitted.
  for (const entry of plan.entries) {
    if (entry.action !== "create") continue;
    const { validated: item } = entry;
    const { body } = await client.request({
      method: "POST",
      path: `${API}/models/${encodeURIComponent(entry.model)}/entries`,
      what: `Creating entry "${entry.key}"`,
      json: draftInput(item.entry, item.model, validated.config, idResolver(mediaIds, entryIds)),
      schema: adminContentEntrySchema,
      expect: [201],
    });
    summary.created += 1;
    await record(entry.key, entry.model, body);
  }

  // Pass 2: save every draft that still differs from its complete candidate.
  for (const entry of plan.entries) {
    const existing = current.get(entry.key)!;
    const candidate = resolvedCandidate(entry.validated, validated.config, mediaIds, entryIds)!;
    if (draftProjection(candidate) === draftProjection(existing.draft)) {
      await record(entry.key, entry.model, existing);
      continue;
    }
    const { validated: item } = entry;
    const { body } = await client.request({
      method: "PUT",
      path: `${API}/entries/${encodeURIComponent(existing.id)}/draft`,
      what: `Saving entry "${entry.key}"`,
      json: {
        ...draftInput(item.entry, item.model, validated.config, idResolver(mediaIds, entryIds)),
        expectedRevision: existing.draft.revision,
      },
      schema: adminContentEntrySchema,
      expect: [200],
    });
    summary.saved += 1;
    await record(entry.key, entry.model, body);
  }

  // Pass 3: publish in dependency order.
  for (const key of plan.publishOrder) {
    const entry = current.get(key)!;
    if (entry.published !== undefined && entry.published.revision === entry.draft.revision)
      continue;
    const { body } = await client.request({
      method: "POST",
      path: `${API}/entries/${encodeURIComponent(entry.id)}/publish`,
      what: `Publishing entry "${key}"`,
      json: { expectedRevision: entry.draft.revision },
      headers: { "idempotency-key": publicationKey(entry.id, entry.draft.revision) },
      schema: publishContentEntryResultSchema,
      expect: [200],
    });
    current.set(key, body.entry);
    summary.published += 1;
  }
  return summary;
}
