import type { FieldDefinition, ModelFieldDefinitions } from "./index.js";

const KEY = /^[A-Za-z][A-Za-z0-9]*$/u;

/** Parse a root key or wildcard schema pointer, never a concrete item index. */
export function parseSchemaPath(value: string): readonly string[] {
  if (typeof value !== "string") throw new Error("Schema path must be a string.");
  const parts =
    typeof value === "string" && value.startsWith("/") ? value.slice(1).split("/") : [value];
  if (
    parts.length === 0 ||
    parts.some((part) => part !== "*" && !KEY.test(part)) ||
    parts[0] === "*"
  )
    throw new Error(`Invalid schema path: ${String(value)}.`);
  return Object.freeze(parts);
}

/** Preserve scalar root addresses while using pointers for descendants. */
export function encodeSchemaPath(parts: readonly string[]): string {
  return parts.length === 1 ? parts[0]! : `/${parts.join("/")}`;
}

/** Resolve descriptor positions, rejecting known invalid container transitions. */
export function schemaFieldAt(
  fields: ModelFieldDefinitions,
  parts: readonly string[],
): FieldDefinition | undefined {
  let current: FieldDefinition | undefined = Object.hasOwn(fields, parts[0]!)
    ? fields[parts[0]!]
    : undefined;
  for (const segment of parts.slice(1)) {
    if (current === undefined) return undefined;
    if (segment === "*" && current.type === "list") current = current.item;
    else if (segment !== "*" && current.type === "group")
      current = Object.hasOwn(current.fields, segment) ? current.fields[segment] : undefined;
    else throw new Error(`Invalid schema traversal: ${encodeSchemaPath(parts)}.`);
  }
  return current;
}
