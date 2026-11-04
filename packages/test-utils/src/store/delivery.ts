import {
  opaqueCursor,
  assertBuildExportPageSize,
  selectBuildExportPage,
} from "@lacecms/application";
import type {
  BuildContentExportPage,
  CursorPage,
  ExportBuildContentPageInput,
  ListPublicContentInput,
  OpaqueCursor,
  PublicContentEntry,
  PublicGlobalContent,
} from "@lacecms/application";
import { BuildExportCursorError, BuildExportVersionChangedError } from "@lacecms/domain";
import type {
  ContentEntry,
  ContentModelKey,
  DraftMediaReference,
  MediaMetadata,
  PublishedSnapshot,
} from "@lacecms/domain";

import { clone } from "../shared/assertions.js";
import { storedExportBytes, BUILD_EXPORT_CURSOR_PREFIX, copyEntry } from "./support.js";
import { InMemoryContentStoreEntries } from "./entries.js";

export class InMemoryContentStoreDelivery extends InMemoryContentStoreEntries {
  public async listPublic(input: ListPublicContentInput): Promise<CursorPage<PublicContentEntry>> {
    const entries = this.publicEntries()
      .filter(({ entry }) => entry.model.key === input.modelKey)
      .map(({ entry, path }) => this.publicView(entry, path));
    return this.page(entries, input.after, input.limit, `public:${input.modelKey}`);
  }

  public async publishedContentVersion(): Promise<number> {
    return this.publicVersion;
  }

  private publicEntries(): readonly { readonly entry: ContentEntry; readonly path: string }[] {
    return [...this.routes.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([path, route]) => ({ entry: this.entries.get(route.entryId)!, path }))
      .filter(({ entry }) => entry.published !== undefined);
  }

  public async loadPublic(path: string): Promise<PublicContentEntry | null> {
    const route = this.routes.get(path);
    if (route === undefined) return null;
    const entry = this.entries.get(route.entryId);
    return entry?.published === undefined ? null : this.publicView(entry, path);
  }

  public async loadPublicGlobal(modelKey: ContentModelKey): Promise<PublicGlobalContent | null> {
    const entry = this.publicGlobals().find((candidate) => candidate.model.key === modelKey);
    return entry === undefined ? null : this.publicGlobalView(entry);
  }

  private publicGlobals(): readonly ContentEntry[] {
    return [...this.entries.values()]
      .filter((entry) => entry.model.kind === "global" && entry.published !== undefined)
      .sort((left, right) => left.model.key.localeCompare(right.model.key));
  }

  private publicGlobalView(entry: ContentEntry): PublicGlobalContent {
    const { entry: projected, media, internalLinks } = this.publicView(entry, "");
    return Object.freeze({ entry: projected, media, internalLinks });
  }

  private deliveredReferences(snapshot: PublishedSnapshot): readonly DraftMediaReference[] {
    const hidden = new Set(
      snapshot.blocks.filter((block) => block.hidden).map((block) => block.key as string),
    );
    return (this.references.get(snapshot.id) ?? []).filter(
      (reference) => !hidden.has(reference.sourceKey),
    );
  }

  private publicView(entry: ContentEntry, path: string): PublicContentEntry {
    const copied = copyEntry(entry);
    const published = Object.freeze({
      ...copied.published!,
      blocks: Object.freeze(copied.published!.blocks.filter((block) => !block.hidden)),
    });
    const ids = new Set(
      this.deliveredReferences(entry.published!).map((reference) => reference.mediaId as string),
    );
    const media = [...ids].sort().flatMap((id) => {
      const value = this.media.get(id);
      return value === undefined || value.status !== "active" ? [] : [clone(value)];
    });
    return Object.freeze({
      entry: Object.freeze({
        ...copied,
        draft: Object.freeze({ ...published, state: "draft" as const }),
        published,
      }),
      media: Object.freeze(media),
      internalLinks: Object.freeze(
        (this.linkReferences.get(entry.published!.id) ?? [])
          .filter((item) => item.delivered)
          .map(({ delivered: _delivered, ...item }) => Object.freeze(item)),
      ),
      path,
    });
  }

  public async loadPublicMedia(id: string): Promise<MediaMetadata | null> {
    // Like PUBLIC_MEDIA_SQL: any current published snapshot, routed or not.
    const isPublished = [...this.entries.values()].some(
      (entry) =>
        entry.published !== undefined &&
        this.deliveredReferences(entry.published).some((reference) => reference.mediaId === id),
    );
    const value = this.media.get(id);
    return isPublished && value !== undefined ? clone(value) : null;
  }

  public async exportBuildContentPage(
    input: ExportBuildContentPageInput,
  ): Promise<BuildContentExportPage> {
    const limit = assertBuildExportPageSize(input.limit);
    const after = input.after === undefined ? undefined : this.decodeExportCursor(input.after);
    if (after !== undefined && after.version !== this.publicVersion) {
      throw new BuildExportVersionChangedError(after.version, this.publicVersion);
    }
    const globals = after === undefined ? this.publicGlobals() : undefined;
    // Binary path order, like SQLite's default collation over published_routes.path.
    const remaining = this.publicEntries()
      .filter(({ path }) => after === undefined || path > after.path)
      .sort((left, right) => (left.path < right.path ? -1 : left.path > right.path ? 1 : 0));
    const { count, more } = selectBuildExportPage(
      remaining
        .slice(0, limit + 1)
        .map(({ entry }) => ({ bytes: storedExportBytes(entry.published!) })),
      limit,
      (globals ?? []).reduce((total, entry) => total + storedExportBytes(entry.published!), 0),
    );
    const selected = remaining.slice(0, count);
    const last = selected.at(-1);
    return Object.freeze({
      entries: Object.freeze(selected.map(({ entry, path }) => this.publicView(entry, path))),
      ...(globals === undefined
        ? {}
        : { globals: Object.freeze(globals.map((entry) => this.publicGlobalView(entry))) }),
      ...(more && last !== undefined
        ? {
            nextCursor: opaqueCursor(
              `${BUILD_EXPORT_CURSOR_PREFIX}${this.publicVersion}:${last.path}`,
            ),
          }
        : {}),
      version: this.publicVersion,
    });
  }

  private decodeExportCursor(cursor: OpaqueCursor): { path: string; version: number } {
    const match = /^build-export:(0|[1-9][0-9]*):(.*)$/su.exec(cursor);
    const version = Number(match?.[1]);
    if (match === null || !Number.isSafeInteger(version)) {
      throw new BuildExportCursorError("Cursor is unsupported or belongs to a different list.");
    }
    return { path: match[2]!, version };
  }
}
