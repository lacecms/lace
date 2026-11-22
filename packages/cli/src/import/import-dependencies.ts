import { snapshotEntryReferences } from "@lacecms/application";
import type { NormalizedContentModel, RuntimeConfigProjection } from "@lacecms/config";
import { pointer } from "./import-format.js";
import type { ImportIssue } from "./import-format.js";
import type { EntryReference } from "./import-references.js";

export interface Dependency {
  readonly target: string;
  readonly pointer: string;
}

export type DependencyGraph = ReadonlyMap<string, readonly Dependency[]>;

type Snapshot = {
  readonly fields: Parameters<typeof snapshotEntryReferences>[2];
  readonly blocks: readonly {
    readonly key: string;
    readonly type: string;
    readonly data: Parameters<typeof snapshotEntryReferences>[2];
    readonly hidden?: boolean | undefined;
  }[];
};

export type SnapshotDependency = Dependency & {
  readonly purpose: "url" | "reference";
  readonly delivered: boolean;
  readonly models?: readonly string[];
  readonly packageKey: boolean;
};

/** Uses the same default and visibility projection as the server after draft normalization. */
export function snapshotDependencies(
  config: { readonly blocks: RuntimeConfigProjection["blocks"] },
  model: NormalizedContentModel,
  index: number,
  snapshot: Snapshot,
  markers: readonly EntryReference[] = [],
): SnapshotDependency[] {
  const byPointer = new Map(markers.map((marker) => [marker.pointer, marker.key]));
  const blockPositions = new Map(snapshot.blocks.map((block, i) => [block.key, i]));
  return snapshotEntryReferences(
    { config },
    model,
    snapshot.fields,
    snapshot.blocks.map(({ key, type, data, hidden }) => ({
      key,
      type,
      data,
      ...(hidden === undefined ? {} : { hidden }),
    })),
  ).map((row) => {
    const path =
      row.area === "fields"
        ? pointer("entries", index, "fields")
        : pointer("entries", index, "blocks", blockPositions.get(row.sourceKey)!, "data");
    const location = path + row.pointer;
    const key = byPointer.get(location);
    return {
      target: key ?? row.targetId,
      pointer: location,
      purpose: row.purpose,
      delivered: row.delivered,
      ...(row.purpose === "reference" ? { models: row.models } : {}),
      packageKey: key !== undefined,
    };
  });
}

/** Returns one cycle's edges in traversal order. The stack is bounded by package size. */
export function findDependencyCycle(graph: DependencyGraph): readonly Dependency[] | undefined {
  const finished = new Set<string>();
  const active = new Map<string, number>();
  for (const key of graph.keys()) {
    if (finished.has(key)) continue;
    const stack = [{ key, edges: (graph.get(key) ?? []).values() }];
    const path: Dependency[] = [];
    active.set(key, 0);
    while (stack.length > 0) {
      const frame = stack.at(-1)!;
      const next = frame.edges.next();
      if (next.done) {
        finished.add(frame.key);
        active.delete(frame.key);
        stack.pop();
        path.pop();
        continue;
      }
      const edge = next.value;
      const start = active.get(edge.target);
      if (start !== undefined) return [...path.slice(start), edge];
      if (finished.has(edge.target) || !graph.has(edge.target)) continue;
      active.set(edge.target, stack.length);
      path.push(edge);
      stack.push({ key: edge.target, edges: graph.get(edge.target)!.values() });
    }
  }
}

export function cycleIssues(
  cycle: readonly Dependency[],
  phase: "draft" | "publication",
): ImportIssue[] {
  return cycle.map(({ pointer, target }, index) => ({
    pointer,
    message: `"${cycle.at(index - 1)!.target}" selects "${target}" in a ${phase} cycle.`,
  }));
}
