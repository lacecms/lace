import { randomBytes } from "node:crypto";
import type { AdminContentEntryDto } from "@lacecms/contracts";
import { cycleIssues, findDependencyCycle, snapshotDependencies } from "./import-dependencies.js";
import type { Dependency, SnapshotDependency } from "./import-dependencies.js";
import { pointer } from "./import-format.js";
import type { ImportIssue } from "./import-format.js";
import { idResolver, placeholderResolver } from "./import-references.js";
import { draftInput, draftIssues, normalizeDraft } from "./import-validate.js";
import type { ValidatedEntry, ValidatedPackage } from "./import-validate.js";

export type EntryAction = "create" | "update" | "unchanged" | "conflict";
export type PublishAction = "publish" | "published" | "not-requested";

export interface EntryPlan {
  readonly key: string;
  readonly model: string;
  readonly action: EntryAction;
  readonly validated: ValidatedEntry;
  readonly current?: AdminContentEntryDto;
  readonly publish: PublishAction;
}

type Graph = Map<string, readonly Dependency[]>;
type Phase = "draft" | "publication";

function localTargets(
  dependencies: readonly SnapshotDependency[],
  keyById: ReadonlyMap<string, string>,
): SnapshotDependency[] {
  return dependencies.flatMap((edge) => {
    const target = edge.packageKey ? edge.target : keyById.get(edge.target);
    return target === undefined ? [] : [{ ...edge, target }];
  });
}

function typedEdges(dependencies: readonly SnapshotDependency[], phase: Phase): Dependency[] {
  return dependencies.filter(
    (edge) => edge.purpose === "reference" && (phase === "draft" || edge.delivered),
  );
}

function currentGraph(
  entries: readonly EntryPlan[],
  config: ValidatedPackage["config"],
  keyById: ReadonlyMap<string, string>,
  phase: Phase,
): Graph {
  return new Map(
    entries.map(({ key, current, validated: { model, index } }) => {
      const snapshot = phase === "draft" ? current?.draft : current?.published;
      const edges =
        snapshot === undefined ? [] : snapshotDependencies(config, model, index, snapshot);
      return [key, typedEdges(localTargets(edges, keyById), phase)];
    }),
  );
}

/** Model the same partial candidates sent by the create pass, including materialized defaults. */
function initialCreates(
  entries: readonly EntryPlan[],
  config: ValidatedPackage["config"],
  mediaIds: ReadonlyMap<string, string>,
  drafts: Graph,
  issues: ImportIssue[],
): void {
  const ids = new Map(entries.flatMap(({ key, current }) => (current ? [[key, current.id]] : [])));
  const byId = new Map([...ids].map(([key, id]) => [id, key]));
  const media = new Map(mediaIds);
  const resolve = idResolver(media, ids);
  for (const { key, action, validated } of entries) {
    if (action !== "create") continue;
    const { entry, index, model, references } = validated;
    for (const reference of references)
      if (reference.kind === "media" && !media.has(reference.key))
        media.set(reference.key, placeholderResolver("media", reference.key));
    try {
      const partial = normalizeDraft(
        draftInput(entry, model, config, resolve),
        model,
        config,
        "draft",
      );
      const edges = snapshotDependencies(config, model, index, partial);
      drafts.set(key, typedEdges(localTargets(edges, byId), "draft"));
    } catch (error) {
      issues.push(...draftIssues(error, (path) => pointer("entries", index, ...path)));
    }
    // Subsequent initial creates can reference this identity. The real ID is read
    // from the server's create response before applying the next write.
    const simulatedId = randomBytes(13).toString("hex");
    ids.set(key, simulatedId);
    byId.set(simulatedId, key);
  }
}

/** In an acyclic graph, a replaced source can only close a cycle via an added edge. */
function closesCycle(graph: Graph, source: string, next: readonly Dependency[]): boolean {
  const previous = new Set(graph.get(source)?.map(({ target }) => target));
  const remaining = next.filter(({ target }) => !previous.has(target)).map(({ target }) => target);
  const visited = new Set<string>();
  while (remaining.length > 0) {
    const target = remaining.pop()!;
    if (target === source) return true;
    if (visited.has(target)) continue;
    visited.add(target);
    for (const edge of graph.get(target) ?? []) remaining.push(edge.target);
  }
  return false;
}

function orderReplacements(
  graph: Graph,
  replacements: Graph,
  phase: Phase,
  prerequisites: ReadonlyMap<string, ReadonlySet<string>>,
  issues: ImportIssue[],
): string[] {
  const cycle = findDependencyCycle(new Map([...graph, ...replacements]));
  if (cycle !== undefined) {
    issues.push(...cycleIssues(cycle, phase));
    return [];
  }
  const pending = new Set(replacements.keys());
  const order: string[] = [];
  while (pending.size > 0) {
    let ready: string | undefined;
    let hasReadyPrerequisites = false;
    for (const key of pending) {
      if ([...(prerequisites.get(key) ?? [])].some((target) => pending.has(target))) continue;
      hasReadyPrerequisites = true;
      if (closesCycle(graph, key, replacements.get(key)!)) continue;
      ready = key;
      break;
    }
    if (ready === undefined) {
      const keys = [...pending].map((key) => `"${key}"`).join(", ");
      issues.push({
        pointer: "/entries",
        message: hasReadyPrerequisites
          ? `Entries ${keys} have no safe ${phase} order. Apply a package that removes the blocking references first.`
          : `Entries ${keys} are waiting for unpublished link targets. Publish one without its blocking link first.`,
      });
      break;
    }
    pending.delete(ready);
    graph.set(ready, replacements.get(ready)!);
    order.push(ready);
  }
  return order;
}

/** Plans complete draft saves and publications against their own current snapshots. */
export function importOrders(
  entries: readonly EntryPlan[],
  config: ValidatedPackage["config"],
  mediaIds: ReadonlyMap<string, string>,
  issues: ImportIssue[],
): { draftOrder: string[]; publishOrder: string[] } {
  const byKey = new Map(entries.map((plan) => [plan.key, plan]));
  const keyById = new Map<string, string>();
  for (const { key, current, validated } of entries) {
    if (current === undefined) continue;
    const sameEntry = keyById.get(current.id);
    if (sameEntry !== undefined)
      issues.push({
        pointer: pointer("entries", validated.index, "key"),
        message: `"${key}" and "${sameEntry}" match the same server entry.`,
      });
    keyById.set(current.id, key);
  }
  if (issues.length > 0) return { draftOrder: [], publishOrder: [] };

  const draftWrites: Graph = new Map();
  const publications: Graph = new Map();
  const prerequisites = new Map<string, Set<string>>();
  for (const { key, action, publish, validated } of entries) {
    const dependencies = localTargets(validated.dependencies, keyById);
    for (const edge of dependencies) {
      const targetModel = byKey.get(edge.target)!.validated.model;
      if (
        (edge.purpose === "reference" && !edge.models?.includes(targetModel.key)) ||
        targetModel.kind === "global" ||
        (edge.purpose === "url" &&
          targetModel.kind === "collection" &&
          targetModel.route === undefined)
      )
        issues.push({
          pointer: edge.pointer,
          message: `"${edge.target}" is ineligible for this field.`,
        });
    }
    if (action !== "unchanged") draftWrites.set(key, typedEdges(dependencies, "draft"));
    if (publish !== "publish") continue;
    publications.set(key, typedEdges(dependencies, "publication"));
    const needs = new Set<string>();
    prerequisites.set(key, needs);
    for (const edge of dependencies) {
      if (!edge.delivered || (edge.purpose === "url" && edge.target === key)) continue;
      const target = byKey.get(edge.target)!;
      if (target.current?.published !== undefined) continue;
      if (target.publish === "publish") needs.add(target.key);
      else
        issues.push({
          pointer: edge.pointer,
          message: `links to "${target.key}", which has no published version and is not published by this import.`,
        });
    }
  }

  const drafts = currentGraph(entries, config, keyById, "draft");
  initialCreates(entries, config, mediaIds, drafts, issues);
  const draftOrder = orderReplacements(drafts, draftWrites, "draft", new Map(), issues);
  const publishOrder = orderReplacements(
    currentGraph(entries, config, keyById, "publication"),
    publications,
    "publication",
    prerequisites,
    issues,
  );
  return { draftOrder, publishOrder };
}
