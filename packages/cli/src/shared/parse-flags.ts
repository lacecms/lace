export interface FlagSpec {
  readonly boolean: readonly string[];
  readonly value: readonly string[];
  readonly positional?: boolean;
  readonly allowFlagValue?: boolean;
  readonly allowWhitespaceValue?: boolean;
  readonly invalid: () => never;
}

/** Tokenize flags once; command adapters retain their own semantic validation. */
export function parseFlags(argv: readonly string[], spec: FlagSpec) {
  const seen = new Set<string>();
  const values = new Map<string, string>();
  const positional: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index]!;
    if (!item.startsWith("--") && spec.positional) {
      positional.push(item);
      continue;
    }
    if (seen.has(item)) spec.invalid();
    seen.add(item);
    if (spec.boolean.includes(item)) continue;
    if (!spec.value.includes(item)) spec.invalid();
    const value = argv[++index];
    if (
      !value ||
      (!spec.allowWhitespaceValue && value.trim().length === 0) ||
      (!spec.allowFlagValue && value.startsWith("--"))
    )
      spec.invalid();
    values.set(item, value);
  }
  return { seen, values, positional };
}
