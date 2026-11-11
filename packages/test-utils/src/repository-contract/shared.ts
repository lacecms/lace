import { admin, editor } from "../fixtures/actors.js";
import {
  applyPreparedConfigurationSynchronization,
  contentModelRoute,
  prepareConfigurationSynchronization,
} from "@lacecms/application";
import type {
  ListQueryLimits,
  ConfigurationSyncApplyPort,
  ConfigurationSyncStateReadPort,
  ContentLinkReadPort,
  ContentEntryCommandPort,
  ContentEntryReadPort,
  DispatcherLeasePort,
  MediaCatalogPort,
  MediaCommandPort,
  MediaDeletionDispatchPort,
  MediaListPort,
  ContentMediaReadPort,
  PublicContentReadPort,
  SaveCompleteDraftInput,
  SiteBuildCommandPort,
  SiteBuildDispatchPort,
  SiteBuildReadPort,
} from "@lacecms/application";

import type { NormalizedContentModel } from "@lacecms/config";

import type { JsonObject } from "@lacecms/content";
import {
  blockKey,
  contentEntryId,
  contentModelKey,
  contentSnapshotId,
  createContentEntry,
  mediaId,
  unixMilliseconds,
} from "@lacecms/domain";
import type { Actor, ContentBlock, ContentEntry, ContentModelRoute } from "@lacecms/domain";
import type { ExpectStatic } from "vitest";

/** Every persistence port a SQL runtime adapter must implement identically. */
export type ContractRepository = ContentLinkReadPort &
  ConfigurationSyncApplyPort &
  ConfigurationSyncStateReadPort &
  ContentEntryCommandPort &
  ContentEntryReadPort &
  DispatcherLeasePort &
  MediaCatalogPort &
  MediaCommandPort &
  MediaDeletionDispatchPort &
  MediaListPort &
  ContentMediaReadPort &
  PublicContentReadPort &
  SiteBuildCommandPort &
  SiteBuildDispatchPort &
  SiteBuildReadPort;

/** Parameterized seeding and inspection over the runtime's migrated database. */
export interface ContractSql {
  all<Row = Record<string, unknown>>(sql: string, ...params: unknown[]): Promise<readonly Row[]>;
  get<Row = Record<string, unknown>>(sql: string, ...params: unknown[]): Promise<Row | undefined>;
  run(sql: string, ...params: unknown[]): Promise<void>;
}

export interface ContractRepositoryOptions {
  readonly beforeMutation?: (checkpoint: string) => void;
  readonly nextId?: () => string;
  readonly resolveModel: (key: string) => ContentModelRoute | undefined;
}

export interface RepositoryContractHarness {
  readonly reads: {
    reset(): void;
    snapshot(): { statements: number; rowsRead?: number; sql: readonly string[] };
  };
  readonly repository: ContractRepository;
  /** Constructs an independent repository over the same database. */
  reopen(options?: Partial<ContractRepositoryOptions>): ContractRepository;
  readonly sql: ContractSql;
}

/** Opens a freshly migrated database for each call. */
export interface RepositoryContractRuntime {
  readonly listQueryLimits?: ListQueryLimits;
  recordEvidence?(value: unknown): void;
  open(options: ContractRepositoryOptions): Promise<RepositoryContractHarness>;
}

export interface RepositoryContractCase {
  readonly name: string;
  run(runtime: RepositoryContractRuntime, expect: ExpectStatic): Promise<void>;
}

/** Checkpoints both adapters expose inside the atomic publication write. */
export const PUBLICATION_CHECKPOINTS = Object.freeze([
  "publish.snapshot",
  "publish.blocks",
  "publish.references",
  "publish.route",
  "public-state",
  "build-outbox",
]);

/** Checkpoints both adapters expose inside the atomic unpublication write. */
export const UNPUBLICATION_CHECKPOINTS = Object.freeze([
  "unpublish.route",
  "public-state",
  "build-outbox",
  "unpublish.snapshot",
]);

/** Checkpoints both adapters expose inside the atomic draft revert. */
export const REVERT_CHECKPOINTS = Object.freeze([
  "revert.draft",
  "revert.blocks",
  "revert.published",
]);

export { admin, editor };
export const routes = new Map<string, ContentModelRoute>([
  ["posts", { key: contentModelKey("posts"), kind: "collection", route: "/blog/:slug" }],
  ["home", { key: contentModelKey("home"), kind: "page", path: "/" }],
  ["settings", { key: contentModelKey("settings"), kind: "global" }],
  ["testimonials", { key: contentModelKey("testimonials"), kind: "collection" }],
]);

export type ContractModelKey = "home" | "posts" | "settings" | "testimonials";
export const CONTRACT_MODELS: Readonly<Record<ContractModelKey, readonly [string, string]>> = {
  home: ["page", "Home"],
  posts: ["collection", "Posts"],
  settings: ["global", "Site settings"],
  testimonials: ["collection", "Testimonials"],
};
export const resolveRoute = (key: string): ContentModelRoute | undefined => routes.get(key);
export const noModels = (): undefined => undefined;

export function sequence(prefix: string): () => string {
  let value = 0;
  return () => `${prefix}-${++value}`;
}

export function base64Url(value: unknown): string {
  let binary = "";
  for (const byte of new TextEncoder().encode(JSON.stringify(value))) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/gu, "-").replace(/\//gu, "_").replace(/=+$/u, "");
}

declare function btoa(data: string): string;
declare function atob(data: string): string;
declare const TextEncoder: new () => { encode(input: string): Uint8Array };

export async function count(
  sql: ContractSql,
  statement: string,
  ...params: unknown[]
): Promise<number> {
  const row = await sql.get<{ count: number }>(statement, ...params);
  return row?.count ?? 0;
}

export async function seedModels(
  sql: ContractSql,
  ...keys: readonly ContractModelKey[]
): Promise<void> {
  for (const key of keys) {
    await sql.run(
      "insert into content_models (key, kind, label, config_version, structure_hash, projection_hash, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?)",
      key,
      CONTRACT_MODELS[key][0],
      CONTRACT_MODELS[key][1],
      1,
      "structure",
      "projection",
      1,
      1,
    );
  }
}

export async function seedMedia(sql: ContractSql, id: string, status = "active"): Promise<void> {
  await sql.run(
    "insert into media (id, storage_key, filename, mime_type, size, metadata_json, status, created_by, created_at, updated_at) values (?, ?, 'image.png', 'image/png', 1, '{}', ?, 'editor', 1, 1)",
    id,
    `media/${id}`,
    status,
  );
}

export async function seedUser(
  sql: ContractSql,
  id: string,
  name: string,
  email: string,
): Promise<void> {
  await sql.run(
    "insert into user (id, name, email, email_verified, role, disabled, created_at, updated_at) values (?, ?, ?, 0, 'editor', 0, 1, 1)",
    id,
    name,
    email,
  );
}

export function entry(
  id: string,
  modelKey: ContractModelKey,
  input: {
    readonly blocks?: readonly ContentBlock[];
    readonly fields?: JsonObject;
    readonly slug?: string;
    readonly title?: string;
    readonly updatedAt: number;
    readonly updatedBy?: Actor;
  },
): ContentEntry {
  const entryId = contentEntryId(id);
  return createContentEntry({
    id: entryId,
    model: routes.get(modelKey)!,
    draft: {
      blocks: input.blocks ?? [],
      createdAt: unixMilliseconds(input.updatedAt),
      entryId,
      fields: input.fields ?? {},
      id: contentSnapshotId(`${id}-draft`),
      revision: 1,
      ...(input.slug === undefined ? {} : { slug: input.slug }),
      state: "draft",
      title: input.title ?? id,
      updatedAt: unixMilliseconds(input.updatedAt),
      updatedBy: input.updatedBy ?? editor,
    },
  });
}

export function heroBlock(key: string, image: string, title = key, type = "hero", position = 1000) {
  return Object.freeze({
    data: { image, title },
    hidden: false,
    key: blockKey(key),
    position,
    schemaVersion: 1,
    settings: {},
    type,
  });
}

export function heroEntry(id: string, modelKey: "home" | "posts", updatedAt: number, title = id) {
  return entry(id, modelKey, {
    blocks: [heroBlock(`${id}-block`, "media-1", title)],
    fields: { image: "media-1", title },
    slug: id,
    title,
    updatedAt,
  });
}

export function references(blockKeyValue: string) {
  return [
    { fieldPath: "image", mediaId: mediaId("media-1"), sourceKey: "$fields" as const },
    { fieldPath: "image", mediaId: mediaId("media-1"), sourceKey: blockKey(blockKeyValue) },
  ];
}

export function save(
  entryId: string,
  expectedRevision: number,
  updatedAt: number,
  overrides: Partial<SaveCompleteDraftInput["mutation"]> = {},
): SaveCompleteDraftInput {
  return {
    entryId: contentEntryId(entryId),
    mutation: {
      blocks: [],
      expectedRevision,
      fields: {},
      mediaReferences: [],
      title: `Saved ${updatedAt}`,
      updatedAt: unixMilliseconds(updatedAt),
      updatedBy: editor,
      ...overrides,
    },
  };
}

export function publish(entryId: string, expectedRevision: number, at: number, snapshot?: string) {
  return {
    entryId: contentEntryId(entryId),
    expectedRevision,
    publishedAt: unixMilliseconds(at),
    publishedBy: editor,
    publishedSnapshotId: contentSnapshotId(snapshot ?? `${entryId}-published-${at}`),
  };
}

export type SyncModel = NormalizedContentModel;

export function syncPage(overrides: Record<string, unknown> = {}): SyncModel {
  return {
    fields: {},
    key: "home",
    kind: "page",
    path: "/",
    projectionHash: "projection-home",
    structureHash: "structure-home",
    version: 1,
    ...overrides,
  } as unknown as SyncModel;
}

export function syncCollection(overrides: Record<string, unknown> = {}): SyncModel {
  return {
    fields: {},
    key: "posts",
    kind: "collection",
    projectionHash: "projection-posts",
    route: "/blog/:slug",
    structureHash: "structure-posts",
    version: 1,
    ...overrides,
  } as unknown as SyncModel;
}

export function syncGlobal(overrides: Record<string, unknown> = {}): SyncModel {
  return {
    fields: {},
    key: "settings",
    kind: "global",
    label: "Site settings",
    projectionHash: "projection-settings",
    structureHash: "structure-settings",
    version: 1,
    ...overrides,
  } as unknown as SyncModel;
}

export function syncResolver(models: readonly SyncModel[]) {
  const values = new Map(models.map((model) => [String(model.key), model]));
  return (key: string): ContentModelRoute | undefined => {
    const model = values.get(key);
    return model === undefined ? undefined : contentModelRoute(model);
  };
}

export async function applySync(
  target: ContractRepository,
  models: readonly SyncModel[],
  at: number,
  prepared?: Awaited<ReturnType<typeof prepareConfigurationSynchronization>>,
) {
  return applyPreparedConfigurationSynchronization({
    clock: { now: () => unixMilliseconds(at) },
    ids: { next: sequence(`sync-${at}`) },
    models,
    prepared: prepared ?? (await prepareConfigurationSynchronization({ models, state: target })),
    target,
  });
}

export function registerContract(cases: RepositoryContractCase[]) {
  return (name: string, run: RepositoryContractCase["run"]): void => {
    cases.push(Object.freeze({ name, run }));
  };
}
