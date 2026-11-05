import { LaceError } from "@lacecms/content";
import { errorMatrixCases } from "./error-matrix.js";

/**
 * Names the exported error classes of a runtime package that the shared error
 * matrix does not classify: neither the class nor a base below `LaceError`
 * has a matrix case. A subclass inherits its base's code, and therefore its
 * classification. `exempt` names classes that never reach a transport.
 */
export function unmatchedErrorClasses(
  exports: Readonly<Record<string, unknown>>,
  exempt: readonly string[] = [],
): readonly string[] {
  const covered = new Set<unknown>(errorMatrixCases.map((entry) => entry.errorClass));
  const matched = (value: Function): boolean => {
    for (let current: unknown = value; typeof current === "function";) {
      if (current === LaceError || current === Error) return false;
      if (covered.has(current)) return true;
      current = Object.getPrototypeOf(current);
    }
    return false;
  };
  return Object.entries(exports)
    .filter(
      ([name, value]) =>
        typeof value === "function" &&
        value.prototype instanceof Error &&
        !exempt.includes(name) &&
        !matched(value),
    )
    .map(([name]) => name)
    .sort();
}
