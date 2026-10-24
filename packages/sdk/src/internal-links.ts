import { decodeEntryLink, isSafeUrl } from "@lacecms/contracts";
import type { BuildExportDto, InternalLinkManifestDto } from "@lacecms/contracts";

export type LinkResolution =
  | { readonly state: "resolved"; readonly href: string; readonly targetId?: string }
  | { readonly state: "unavailable"; readonly targetId: string }
  | { readonly state: "empty" };
export interface PublishedLinkLookup {
  link(value: unknown): LinkResolution;
}
export interface LinkDiagnostic {
  readonly sourceId: string;
  readonly modelKey: string;
  readonly sourceKey: string;
  readonly area: "fields" | "data";
  readonly pointer: string;
  readonly targetId: string;
}
export interface LinkDiagnostics {
  readonly total: number;
  readonly items: readonly LinkDiagnostic[];
  readonly truncated: boolean;
}

/** Freeze the detached transport tree before exposing any site view. */
export function immutable<Value>(value: Value): Value {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const item of Object.values(value)) immutable(item);
    Object.freeze(value);
  }
  return value;
}
function compare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
function atPointer(root: unknown, pointer: string): unknown {
  let value = root;
  for (const key of pointer
    .slice(1)
    .split("/")
    .map((part) => part.replaceAll("~1", "/").replaceAll("~0", "~"))) {
    if (value === null || typeof value !== "object" || !Object.hasOwn(value, key)) return undefined;
    value = (value as Record<string, unknown>)[key];
  }
  return value;
}

/** O(entries + locations) setup; lookups are pure O(1), with no target requests. */
export function publishedLinks(
  exported: Pick<BuildExportDto, "entries" | "globals">,
): PublishedLinkLookup & { readonly linkDiagnostics: LinkDiagnostics } {
  const sources = [...exported.entries, ...exported.globals];
  const identities = new Set<string>();
  const routes = new Map<string, string>();
  for (const source of sources) {
    if (identities.has(source.id))
      throw new TypeError("The build export contains duplicate source IDs.");
    identities.add(source.id);
  }
  for (const entry of exported.entries) {
    if (!isSafeUrl(entry.path) || !entry.path.startsWith("/"))
      throw new TypeError("The build export contains an unsafe published route.");
    routes.set(entry.id, entry.path);
  }
  const link = (value: unknown): LinkResolution => {
    if (value === undefined || value === null || value === "")
      return Object.freeze({ state: "empty" });
    const targetId = decodeEntryLink(value);
    if (targetId !== undefined) {
      const href = routes.get(targetId);
      return href === undefined
        ? Object.freeze({ state: "unavailable", targetId })
        : Object.freeze({ state: "resolved", href, targetId });
    }
    if (isSafeUrl(value)) return Object.freeze({ state: "resolved", href: value });
    throw new TypeError("Invalid URL field target.");
  };
  const items: LinkDiagnostic[] = [];
  let total = 0;
  for (const source of sources.sort((a, b) => compare(a.id, b.id))) {
    const blocks = new Map(source.blocks.map((block) => [block.key, block]));
    if (blocks.size !== source.blocks.length)
      throw new TypeError("The build export contains duplicate block identities.");
    const locations = new Set<string>();
    const references: InternalLinkManifestDto = [...source.internalLinks].sort(
      (a, b) =>
        compare(a.area, b.area) ||
        compare(a.sourceKey, b.sourceKey) ||
        compare(a.pointer, b.pointer),
    );
    for (const reference of references) {
      const location = JSON.stringify([reference.area, reference.sourceKey, reference.pointer]);
      if (locations.has(location))
        throw new TypeError("The build export contains duplicate link locations.");
      locations.add(location);
      const root =
        reference.area === "fields" ? source.fields : blocks.get(reference.sourceKey)?.data;
      if (
        (reference.area === "fields") !== (reference.sourceKey === "$fields") ||
        decodeEntryLink(atPointer(root, reference.pointer)) !== reference.targetId
      )
        throw new TypeError("The build export's link manifest disagrees with its source content.");
      if (routes.has(reference.targetId)) continue;
      total += 1;
      if (items.length < 100)
        items.push(Object.freeze({ sourceId: source.id, modelKey: source.modelKey, ...reference }));
    }
  }
  return Object.freeze({
    link,
    linkDiagnostics: Object.freeze({
      total,
      items: Object.freeze(items),
      truncated: total > items.length,
    }),
  });
}
