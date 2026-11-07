import { readFileSync, readdirSync } from "node:fs";
import { resolve, relative } from "node:path";
import { expect, test } from "vitest";

const root = resolve(import.meta.dirname, "..");
const names = [
  "effectiveVisibilityValues",
  "isFieldVisible",
  "SLUG_PATTERN",
  "MAX_SLUG_LENGTH",
  "ContentModelKind",
  "isContentSlug",
  "MAX_ENTRY_SEARCH_LENGTH",
  "MAX_CONTENT_ENTRY_SEARCH_LENGTH",
  "MAX_MEDIA_SEARCH_LENGTH",
  "MAX_MEDIA_USAGE_ENTRIES",
  "MAX_BUILD_EXPORT_PAGE_SIZE",
  "deepFreeze",
  "isPlainObject",
  "isRecord",
  "isPortableJsonValue",
  "isJsonValue",
];
const grammar = "[a-z0-9]+(?:-[a-z0-9]+)*";
// Exceptions name the file and the declaration that owns the occurrence.
const allowedGrammar = [
  {
    file: "packages/contracts/src/content/entries.ts",
    owner: "contentEntryListQuerySchema",
    reason: "Strict-end query spelling is pinned in OpenAPI and checked for parity.",
  },
  {
    file: "packages/contracts/src/builds/build-site.ts",
    owner: "buildSiteIdentitySchema",
    reason: "Build site IDs are a distinct identifier.",
  },
];

/**
 * Grammar literals and named limits that only their owner may spell. A line
 * matches when it contains `literal`, or matches `pattern` (both within one
 * line, so a limit is recognized next to the property it bounds).
 */
const literalDetectors = [
  {
    name: "inline field key grammar",
    literal: "[A-Za-z][A-Za-z0-9]*",
    owner: "packages/content/src/fields/definitions.ts",
  },
  {
    name: "inline block type grammar",
    literal: "[A-Za-z][A-Za-z0-9-]*",
    owner: "packages/content/src/blocks/definition.ts",
  },
  {
    name: "inline model key grammar",
    literal: "[a-z][a-z0-9]*(?:-[a-z0-9]+)*",
    owner: "packages/content/src/shared/identifiers.ts",
  },
  {
    name: "inline media tag grammar",
    literal: "[a-z0-9-]{1,",
    owner: "packages/domain/src/media/metadata.ts",
  },
  {
    name: "inline title length",
    pattern: /\btitle\b.*maxLength(?:\(\s*200\s*\)|:\s*200\b)/u,
    owner: "packages/content/src/entries/aggregate.ts",
  },
  {
    name: "inline page size",
    pattern: /\blimit\b.*(?:>\s*100\b|maxValue\(\s*100\s*\)|Math\.min\(\s*100\b)/u,
    owner: "packages/content/src/shared/identifiers.ts",
  },
  {
    name: "inline video providers",
    pattern: /["']youtube["']\s*,\s*["']vimeo["']|["']vimeo["']\s*,\s*["']youtube["']/u,
    owner: "packages/content/src/fields/video-embeds.ts",
  },
];
// Exceptions name the detector, the file and the declaration that owns the occurrence.
// None today: every copy imports its owner.
const allowedLiterals = [];

/** The innermost top-level declaration name that precedes `index`. */
function ownerAt(source, index) {
  return [
    ...source
      .slice(0, index)
      .matchAll(/^(?:export )?(?:async )?(?:const|let|function|class|interface|type) (\w+)/gmu),
  ].at(-1)?.[1];
}

const errorOwners = {
  LaceError: "packages/content/src/shared/errors.ts",
  InvariantError: "packages/content/src/shared/errors.ts",
  AccountError: "packages/domain/src/access/errors.ts",
  RateLimitExceededError: "packages/domain/src/access/errors.ts",
  ContractValidationError: "packages/contracts/src/shared/validation-error.ts",
  classifyError: "packages/contracts/src/errors/classification.ts",
};

function violations(source, file) {
  const found = [];
  const lineOf = (index) => source.slice(0, index).split("\n").length;
  const errors = new RegExp(
    `\\b(?:const|let|function|class)\\s+(${Object.keys(errorOwners).join("|")})\\b`,
    "gu",
  );
  for (const match of source.matchAll(errors))
    if (errorOwners[match[1]] !== file)
      found.push(`${file}:${lineOf(match.index)}: duplicate ${match[1]}`);
  if (/^packages\/(?:content|application)\/src\//u.test(file))
    for (const match of source.matchAll(/\bnew\s+Error\s*\(/gu))
      found.push(`${file}:${lineOf(match.index)}: raw Error construction`);
  const lines = source.split("\n");
  let offset = 0;
  for (let i = 0; i < lines.length; offset += lines[i].length + 1, i++)
    for (const detector of literalDetectors) {
      if (detector.owner === file) continue;
      const hit =
        detector.literal === undefined
          ? detector.pattern.test(lines[i])
          : lines[i].includes(detector.literal);
      if (!hit) continue;
      const owner = ownerAt(source, offset);
      if (
        !allowedLiterals.some(
          (entry) =>
            entry.detector === detector.name && entry.file === file && entry.owner === owner,
        )
      )
        found.push(`${file}:${i + 1}: ${detector.name}`);
    }
  if (file.startsWith("packages/content/src/")) return found;
  const declaration = new RegExp(
    `\\b(?:const|let|type|interface|function|class)\\s+(${names.join("|")})\\b`,
    "gu",
  );
  for (const match of source.matchAll(declaration))
    found.push(`${file}:${lineOf(match.index)}: duplicate ${match[1]}`);
  offset = 0;
  for (let i = 0; i < lines.length; offset += lines[i].length + 1, i++) {
    if (
      /\brule\.values\.includes\s*\(/u.test(lines[i]) &&
      !(
        file ===
          "apps/admin/src/widgets/block-editor/BlockSettingsFields/BlockSettingsFields.tsx" &&
        lines[i].trim() === 'return typeof value === "string" && rule.values.includes(value);'
      )
    )
      found.push(`${file}:${i + 1}: inline field visibility match`);
    // BlockSettingsFields evaluates settingsVisibility: a distinct presentation-only rule.
    if (!lines[i].includes(grammar)) continue;
    const owner = ownerAt(source, offset);
    if (!allowedGrammar.some((entry) => entry.file === file && entry.owner === owner))
      found.push(`${file}:${i + 1}: inline slug grammar`);
  }
  return found;
}

function sources(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory())
      return ["dist", "test", "test-support"].includes(entry.name) ? [] : sources(path);
    return /\.tsx?$/u.test(path) && !/\.(?:test|type-test)\./u.test(path) ? [path] : [];
  });
}

test("shared identifiers, route vocabulary, limits and helpers have one portable owner", () => {
  const files = ["packages", "apps"].flatMap((dir) =>
    readdirSync(resolve(root, dir), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .flatMap((entry) => {
        try {
          return sources(resolve(root, dir, entry.name, "src"));
        } catch (error) {
          if (error.code === "ENOENT") return [];
          throw error;
        }
      }),
  );
  expect(
    files.flatMap((file) => violations(readFileSync(file, "utf8"), relative(root, file))),
  ).toEqual([]);
});

test.each([
  ["duplicate-error.ts", "duplicate LaceError"],
  ["inline-visibility.ts", "inline field visibility match"],
  ["duplicate-visibility.ts", "duplicate effectiveVisibilityValues"],
  ["duplicate-field-visible.ts", "duplicate isFieldVisible"],
  ["duplicate-slug.ts", "duplicate SLUG_PATTERN"],
  ["duplicate-limit.ts", "duplicate MAX_MEDIA_USAGE_ENTRIES"],
  ["inline-regex.ts", "inline slug grammar"],
])("vocabulary guard reports %s with its file and line", (file, reason) => {
  expect(
    violations(readFileSync(resolve(root, "tests/fixtures/shared-vocabulary", file), "utf8"), file),
  ).toEqual([`${file}:2: ${reason}`]);
});

test("vocabulary guard accepts re-exports", () => {
  const file = "allowed-reexport.ts";
  expect(
    violations(readFileSync(resolve(root, "tests/fixtures/shared-vocabulary", file), "utf8"), file),
  ).toEqual([]);
});

test.each(["content", "application"])("vocabulary guard rejects raw Error in %s source", (pkg) => {
  const file = `packages/${pkg}/src/raw-error.ts`;
  expect(
    violations(
      readFileSync(resolve(root, "tests/fixtures/shared-vocabulary/raw-error.ts"), "utf8"),
      file,
    ),
  ).toEqual([`${file}:2: raw Error construction`]);
});

test.each(Object.keys(errorOwners))(
  "vocabulary guard rejects duplicate %s declarations",
  (name) => {
    expect(violations(`// fixture\nexport class ${name} {}\n`, "duplicate.ts")).toEqual([
      `duplicate.ts:2: duplicate ${name}`,
    ]);
  },
);

// Scratch copies: a real production file with one offending line appended.
const scratchBase = "packages/server/src/routes/media.ts";
test.each([
  ["inline field key grammar", "const key = /^[A-Za-z][A-Za-z0-9]*$/u;"],
  ["inline block type grammar", 'const type = new RegExp("^[A-Za-z][A-Za-z0-9-]*$");'],
  ["inline model key grammar", "const model = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u;"],
  ["inline media tag grammar", "const tag = /^[a-z0-9-]{1,40}$/u;"],
  ["inline title length", "const schema = { title: v.pipe(v.string(), v.maxLength(200)) };"],
  ["inline page size", "if (input.limit > 100) throw new TypeError();"],
  ["inline page size", "const limit = v.pipe(v.number(), v.maxValue(100));"],
  ["inline video providers", 'const providers = ["youtube", "vimeo"];'],
])("vocabulary guard reports %s in a scratch copy", (reason, line) => {
  const source = `${readFileSync(resolve(root, scratchBase), "utf8")}${line}\n`;
  const lineNumber = source.split("\n").length - 1;
  expect(violations(source, scratchBase)).toEqual([`${scratchBase}:${lineNumber}: ${reason}`]);
});

test("vocabulary guard leaves a grammar literal to its declared owner", () => {
  const owner = "packages/content/src/fields/definitions.ts";
  expect(violations(readFileSync(resolve(root, owner), "utf8"), owner)).toEqual([]);
});
