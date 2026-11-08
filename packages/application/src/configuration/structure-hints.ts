import type { StructureHints, StructureHintIssue } from "./types.js";
import type { ContentModelStructure } from "@lacecms/config";
import { InvariantError, isRecord, parseSchemaPath, encodeSchemaPath } from "@lacecms/content";
import type { FieldDefinition } from "@lacecms/content";

/** Resolve a configured schema address through applicable ancestor rename pairs. */
function baselineFieldAt(
  baseline: ContentModelStructure,
  path: readonly string[],
  hints: StructureHints,
): FieldDefinition | undefined {
  let fields = (isRecord(baseline.fields) ? baseline.fields : {}) as unknown as Readonly<
    Record<string, FieldDefinition>
  >;
  let current: FieldDefinition | undefined;
  for (let index = 0; index < path.length; index++) {
    const part = path[index]!;
    if (part === "*") {
      if (current === undefined) return undefined;
      if (current.type !== "list") throw new InvariantError("Wildcard does not address a list.");
      current = current.item;
    } else {
      if (index > 0) {
        if (current === undefined) return undefined;
        if (current.type !== "group")
          throw new InvariantError("Named child does not address a group.");
        fields = current.fields;
      }
      const address = encodeSchemaPath(path.slice(0, index + 1));
      const former = hints.renamedFields?.[address];
      const source = former === undefined ? undefined : parseSchemaPath(former).at(-1);
      const key =
        index < path.length - 1 &&
        source !== undefined &&
        Object.hasOwn(fields, source) &&
        !Object.hasOwn(fields, part)
          ? source
          : part;
      current = Object.hasOwn(fields, key) ? fields[key] : undefined;
    }
  }
  return current;
}

/** Validate nested hints in paired ancestor contexts, preserving inert applied hints. */
export function validateStructureHints(
  baseline: ContentModelStructure,
  hints: StructureHints,
): readonly StructureHintIssue[] {
  const issues: StructureHintIssue[] = [];
  for (const [target, from] of Object.entries(hints.renamedFields ?? {})) {
    try {
      const hasSource = baselineFieldAt(baseline, parseSchemaPath(from), hints) !== undefined;
      const hasTarget = baselineFieldAt(baseline, parseSchemaPath(target), hints) !== undefined;
      if (hasSource && hasTarget) issues.push({ from, kind: "target-exists", target });
      if (!hasSource && !hasTarget) issues.push({ from, kind: "source-missing", target });
    } catch {
      issues.push({ from, kind: "source-missing", target });
    }
  }
  for (const target of hints.removedFields ?? []) {
    try {
      baselineFieldAt(baseline, parseSchemaPath(target), hints);
    } catch {
      issues.push({ from: target, kind: "source-missing", target });
    }
  }
  return Object.freeze(
    issues
      .sort((left, right) => left.target.localeCompare(right.target))
      .map((issue) => Object.freeze(issue)),
  );
}
