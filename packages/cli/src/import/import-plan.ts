import { canonicalizeJson, normalizeMediaText, resolveModelKind } from "@lacecms/application";
import type { NormalizedDraftCandidate } from "@lacecms/application";
import {
  adminContentEntrySchema,
  contentEntryListSchema,
  contentModelListSchema,
  importCredentialSchema,
  mediaDetailSchema,
  mediaListSchema,
} from "@lacecms/contracts";
import type * as v from "valibot";
import type { ImportClient } from "./import-client.js";
import { ImportError, pointer } from "./import-format.js";
import type { ImportIssue } from "./import-format.js";
import type { MediaMetadataPatch, PackageMediaFile } from "./import-files.js";
import { importOrders } from "./import-order.js";
import type { EntryAction, EntryPlan, PublishAction } from "./import-order.js";
import { idResolver } from "./import-references.js";
import type { ImportState, StateEntry } from "./import-state.js";
import { draftInput, draftIssues, normalizeDraft } from "./import-validate.js";
import type { ValidatedEntry, ValidatedPackage } from "./import-validate.js";

export type AdminEntry = v.InferOutput<typeof adminContentEntrySchema>;
type MediaDto = v.InferOutput<typeof mediaListSchema>["items"][number];

export type MediaAction = "upload" | "update" | "unchanged";

export interface MediaPlan {
  readonly key: string;
  readonly action: MediaAction;
  readonly file: PackageMediaFile;
  readonly metadata: MediaMetadataPatch;
  /** The supplied metadata that differs from the matched item (or all of it for uploads). */
  readonly changes: MediaMetadataPatch;
  readonly mediaId?: string;
  /** An earlier package item with identical bytes that this item reuses. */
  readonly sameAs?: string;
}

export interface ImportPlan {
  readonly media: readonly MediaPlan[];
  readonly entries: readonly EntryPlan[];
  readonly draftOrder: readonly string[];
  /** Entry keys in publication order. */
  readonly publishOrder: readonly string[];
  readonly publication: "requested" | "skipped";
}

export interface PlanOptions {
  readonly publish: boolean;
  readonly overwrite: boolean;
}

const API = "/api/v1/admin";

function segment(value: string): string {
  return encodeURIComponent(value);
}

/** Fails before any write when the token cannot do what the plan needs. */
export async function checkCredential(
  client: ImportClient,
  validated: ValidatedPackage,
  options: PlanOptions,
): Promise<readonly string[]> {
  const { body } = await client.request({
    method: "GET",
    path: `${API}/import-credential`,
    what: "Reading the import credential",
    schema: importCredentialSchema,
    expect: [200],
  });
  if (
    options.publish &&
    validated.entries.some((entry) => entry.willPublish) &&
    !body.permissions.includes("content:publish")
  )
    throw new ImportError(
      "IMPORT_UNAUTHORIZED",
      "--publish needs an import token with the content:publish capability; issue one in Settings with publishing allowed, or rerun without --publish.",
    );
  return body.permissions;
}

/** Fails when the server's models or block versions differ from lace.config.ts. */
export async function checkServerConfiguration(
  client: ImportClient,
  validated: ValidatedPackage,
): Promise<void> {
  const { body } = await client.request({
    method: "GET",
    path: `${API}/content-models`,
    what: "Reading content models",
    schema: contentModelListSchema,
    expect: [200],
  });
  const server = new Map(body.items.map((model) => [model.key, model]));
  const problems = new Set<string>();
  for (const { entry, model } of validated.entries) {
    const remote = server.get(model.key);
    if (remote === undefined) {
      problems.add(`Model "${model.key}" does not exist on the server.`);
      continue;
    }
    if (remote.kind !== model.kind || remote.version !== model.version)
      problems.add(
        `Model "${model.key}" is ${remote.kind} version ${remote.version} on the server and ${model.kind} version ${model.version} in lace.config.ts.`,
      );
    for (const block of entry.blocks) {
      const local = validated.config.blocks.get(block.type);
      const definition = remote.blockDefinitions?.find((item) => item.type === block.type);
      if (!remote.blocks.includes(block.type) || definition === undefined)
        problems.add(
          `Block "${block.type}" is not allowed for model "${model.key}" on the server.`,
        );
      else if (definition.version !== local?.version)
        problems.add(
          `Block "${block.type}" is version ${definition.version} on the server and ${local?.version} in lace.config.ts.`,
        );
    }
  }
  if (problems.size > 0)
    throw new ImportError(
      "IMPORT_CONFIG_MISMATCH",
      `The server configuration differs from lace.config.ts: ${[...problems].join(" ")} Run lace content sync against this installation, or use its matching configuration.`,
    );
}

/** The value a media item's text metadata would store. */
function storedText(value: string | null, kind: "alt" | "caption"): string | undefined {
  return value === null ? undefined : (normalizeMediaText(value, kind) ?? undefined);
}

export function metadataChanges(patch: MediaMetadataPatch, dto: MediaDto): MediaMetadataPatch {
  const changes: Record<string, unknown> = {};
  for (const kind of ["alt", "caption"] as const) {
    const value = patch[kind];
    if (value !== undefined && storedText(value, kind) !== dto[kind]) changes[kind] = value;
  }
  if (patch.focalPoint !== undefined) {
    const current = dto.focalPoint;
    const next = patch.focalPoint;
    if (
      (next === null) !== (current === undefined) ||
      (next !== null && (next.x !== current?.x || next.y !== current?.y))
    )
      changes.focalPoint = next;
  }
  if (
    patch.tags !== undefined &&
    canonicalizeJson([...patch.tags].sort()) !== canonicalizeJson(dto.tags)
  )
    changes.tags = patch.tags;
  return changes as MediaMetadataPatch;
}

async function findMedia(
  client: ImportClient,
  state: ImportState,
  key: string,
  file: PackageMediaFile,
): Promise<MediaDto | undefined> {
  const recorded = state.media(key);
  if (recorded?.sha256 === file.sha256) {
    const { body } = await client.request({
      method: "GET",
      path: `${API}/media/${segment(recorded.id)}`,
      what: `Reading media "${key}"`,
      schema: mediaDetailSchema,
      expect: [200],
      allowNotFound: true,
    });
    if (body !== undefined && body.status === "active" && body.sha256 === file.sha256) {
      const { usage: _usage, ...metadata } = body;
      return metadata;
    }
  }
  const { body } = await client.request({
    method: "GET",
    path: `${API}/media`,
    what: `Looking up media "${key}"`,
    query: { sha256: file.sha256, sort: "createdAt", limit: "1" },
    schema: mediaListSchema,
    expect: [200],
  });
  return body.items[0];
}

async function planMedia(
  client: ImportClient,
  state: ImportState,
  validated: ValidatedPackage,
): Promise<MediaPlan[]> {
  const plans: MediaPlan[] = [];
  const byHash = new Map<string, MediaPlan>();
  for (const item of validated.pkg.media) {
    const file = validated.media.files.get(item.key)!;
    const metadata = validated.media.metadata.get(item.key) ?? {};
    const twin = byHash.get(file.sha256);
    if (twin !== undefined) {
      plans.push({
        key: item.key,
        action: "unchanged",
        file,
        metadata,
        changes: {},
        sameAs: twin.key,
        ...(twin.mediaId === undefined ? {} : { mediaId: twin.mediaId }),
      });
      continue;
    }
    const found = await findMedia(client, state, item.key, file);
    const changes = found === undefined ? metadata : metadataChanges(metadata, found);
    const plan: MediaPlan = {
      key: item.key,
      action:
        found === undefined ? "upload" : Object.keys(changes).length > 0 ? "update" : "unchanged",
      file,
      metadata,
      changes,
      ...(found === undefined ? {} : { mediaId: found.id }),
    };
    byHash.set(file.sha256, plan);
    plans.push(plan);
  }
  return plans;
}

async function readEntry(
  client: ImportClient,
  key: string,
  entryId: string,
): Promise<AdminEntry | undefined> {
  const { body } = await client.request({
    method: "GET",
    path: `${API}/entries/${segment(entryId)}`,
    what: `Reading entry "${key}"`,
    schema: adminContentEntrySchema,
    expect: [200],
    allowNotFound: true,
  });
  return body;
}

async function listEntries(
  client: ImportClient,
  key: string,
  model: string,
  slug?: string,
): Promise<readonly { readonly id: string }[]> {
  const { body } = await client.request({
    method: "GET",
    path: `${API}/models/${segment(model)}/entries`,
    what: `Looking up entry "${key}"`,
    query: { limit: "2", ...(slug === undefined ? {} : { slug }) },
    schema: contentEntryListSchema,
    expect: [200],
  });
  return body.items;
}

/** The server entry an import entry matches, or undefined when it must be created. */
async function findEntry(
  client: ImportClient,
  state: ImportState,
  validated: ValidatedEntry,
  issues: ImportIssue[],
): Promise<AdminEntry | undefined> {
  const { entry, index, model } = validated;
  const behavior = resolveModelKind(model);
  const recorded = state.entry(entry.key);
  if (behavior.cardinality === "many" && recorded?.model === model.key) {
    const current = await readEntry(client, entry.key, recorded.id);
    if (current?.model.key === model.key && current.draft.slug === entry.slug) return current;
  }
  // A route-less entry has no slug to look up: only its state-file mapping matches it.
  if (behavior.publicFamily === "records") return undefined;
  const items = await listEntries(
    client,
    entry.key,
    model.key,
    behavior.routing === "slug" ? entry.slug : undefined,
  );
  if (items.length === 0) {
    if (behavior.cardinality === "one")
      issues.push({
        pointer: pointer("entries", index, "model"),
        message: `has no ${model.kind} entry on the server; run lace content sync against this installation.`,
      });
    return undefined;
  }
  if (items.length > 1) {
    issues.push({
      pointer: pointer("entries", index, "slug"),
      message: `matches several drafts of "${model.key}" on the server; give them distinct slugs in the admin first.`,
    });
    return undefined;
  }
  return readEntry(client, entry.key, items[0]!.id);
}

/**
 * SEO in one comparable form: admin DTOs list every SEO value with nulls,
 * normalized candidates omit unset values, and an empty group stores nothing.
 */
function seoForm(seo: unknown): unknown {
  if (seo === null || seo === undefined || typeof seo !== "object") return null;
  const values = seo as Record<string, unknown>;
  const form = {
    canonical: values.canonical ?? null,
    description: values.description ?? null,
    image: values.image ?? null,
    noindex: values.noindex ?? false,
    title: values.title ?? null,
  };
  return Object.values(form).every((value) => value === null || value === false) ? null : form;
}

/** Canonical comparison form of a draft's stored values. */
export function draftProjection(draft: {
  readonly title: string;
  readonly slug?: string | undefined;
  readonly fields: unknown;
  readonly seo?: unknown;
  readonly blocks: readonly {
    readonly key: string;
    readonly position: number;
    readonly type: string;
    readonly schemaVersion: number;
    readonly data: unknown;
    readonly settings?: unknown;
    readonly hidden?: boolean | undefined;
    readonly anchor?: string | undefined;
    readonly className?: string | undefined;
  }[];
}): string {
  return canonicalizeJson({
    title: draft.title,
    slug: draft.slug ?? null,
    fields: draft.fields,
    seo: seoForm(draft.seo),
    blocks: draft.blocks.map((block) => ({
      key: block.key,
      position: block.position,
      type: block.type,
      schemaVersion: block.schemaVersion,
      data: block.data,
      settings: block.settings ?? {},
      hidden: block.hidden ?? false,
      anchor: block.anchor ?? null,
      className: block.className ?? null,
    })),
  } as never);
}

/** The normalized candidate with every reference resolved, or null when one is still unknown. */
export function resolvedCandidate(
  validated: ValidatedEntry,
  config: ValidatedPackage["config"],
  mediaIds: ReadonlyMap<string, string>,
  entryIds: ReadonlyMap<string, string>,
): NormalizedDraftCandidate | null {
  const known = validated.references.every((reference) =>
    (reference.kind === "media" ? mediaIds : entryIds).has(reference.key),
  );
  if (!known) return null;
  try {
    return normalizeDraft(
      draftInput(validated.entry, validated.model, config, idResolver(mediaIds, entryIds)),
      validated.model,
      config,
      "draft",
    );
  } catch (error) {
    throw new ImportError(
      "IMPORT_INVALID",
      `Entry "${validated.entry.key}" is invalid with the resolved IDs.`,
      draftIssues(error, (path) => pointer("entries", validated.index, ...path)),
    );
  }
}

function isCurrentPublication(entry: AdminEntry | undefined): boolean {
  return entry?.published !== undefined && entry.published.revision === entry.draft.revision;
}

function conflictWith(recorded: StateEntry | undefined, current: AdminEntry): boolean {
  return (
    recorded !== undefined &&
    recorded.id === current.id &&
    recorded.revision !== current.draft.revision
  );
}

/**
 * Builds the complete plan from server lookups. Read-only: issues found here
 * fail the run before the first write.
 */
export async function planImport(
  client: ImportClient,
  state: ImportState,
  validated: ValidatedPackage,
  options: PlanOptions,
): Promise<ImportPlan> {
  const media = await planMedia(client, state, validated);
  const mediaIds = new Map(
    media.flatMap((plan) =>
      plan.mediaId === undefined ? [] : [[plan.key, plan.mediaId] as const],
    ),
  );
  const issues: ImportIssue[] = [];
  const found = new Map<string, AdminEntry | undefined>();
  for (const entry of validated.entries)
    found.set(entry.entry.key, await findEntry(client, state, entry, issues));
  if (issues.length > 0)
    throw new ImportError(
      issues.some((issue) => issue.message.startsWith("matches several"))
        ? "IMPORT_CONFLICT"
        : "IMPORT_CONFIG_MISMATCH",
      "Server entries cannot be matched unambiguously.",
      issues,
    );
  const entryIds = new Map(
    [...found].flatMap(([key, entry]) => (entry === undefined ? [] : [[key, entry.id] as const])),
  );
  const entries: EntryPlan[] = validated.entries.map((item) => {
    const current = found.get(item.entry.key);
    let action: EntryAction = "create";
    if (current !== undefined) {
      const candidate = resolvedCandidate(item, validated.config, mediaIds, entryIds);
      const changed =
        candidate === null || draftProjection(candidate) !== draftProjection(current.draft);
      action = !changed
        ? "unchanged"
        : conflictWith(state.entry(item.entry.key), current) && !options.overwrite
          ? "conflict"
          : "update";
    }
    const publish: PublishAction = !item.willPublish
      ? "not-requested"
      : action === "unchanged" && isCurrentPublication(current)
        ? "published"
        : "publish";
    return {
      key: item.entry.key,
      model: item.model.key,
      action,
      validated: item,
      ...(current === undefined ? {} : { current }),
      publish,
    };
  });
  const orders = entries.some(({ action }) => action === "conflict")
    ? { draftOrder: [], publishOrder: [] }
    : importOrders(entries, validated.config, mediaIds, issues);
  if (issues.length > 0)
    throw new ImportError("IMPORT_INVALID", "Import writes cannot be ordered.", issues);
  return {
    media,
    entries,
    ...orders,
    publication: options.publish ? "requested" : "skipped",
  };
}
