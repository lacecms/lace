import { fail } from "../shared/errors.js";
import { isRecord } from "../shared/objects.js";

/** Reads own data properties without executing configuration accessors. */
export function descriptorRecord(value: unknown, path: string): Record<string, unknown> {
  if (!isRecord(value)) fail(path, "must be a plain field-definition object.");
  const output: Record<string, unknown> = {};
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string") fail(path, "must not contain symbol keys.");
    const property = Object.getOwnPropertyDescriptor(value, key)!;
    if (!property.enumerable || !("value" in property))
      fail(`${path}.${key}`, "must be an enumerable data property.");
    Object.defineProperty(output, key, { value: property.value, enumerable: true });
  }
  return output;
}
