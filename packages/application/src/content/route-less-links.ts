import type { LinkTargetStatus } from "../ports/links.js";

/** The keys of configured collections without a route, sorted for stable query scopes. */
export function routeLessModelKeys(
  models: readonly { readonly key: string; readonly kind: string; readonly route?: string }[],
): readonly string[] {
  return models
    .filter((model) => model.kind === "collection" && model.route === undefined)
    .map((model) => model.key)
    .sort();
}

/**
 * Reports entries of route-less collections as `non-routable`, like globals:
 * persistence knows only the model kind, while routability is configuration.
 */
export function markRouteLessTargets(
  statuses: Readonly<Record<string, LinkTargetStatus>>,
  routeLessKeys: readonly string[],
): Readonly<Record<string, LinkTargetStatus>> {
  if (routeLessKeys.length === 0) return statuses;
  const keys = new Set(routeLessKeys);
  return Object.fromEntries(
    Object.entries(statuses).map(([id, status]) => [
      id,
      "modelKey" in status && status.state !== "non-routable" && keys.has(status.modelKey)
        ? { id: status.id, modelKey: status.modelKey, state: "non-routable" as const }
        : status,
    ]),
  );
}
