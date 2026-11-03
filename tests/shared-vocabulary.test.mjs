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
];
const grammar = "[a-z0-9]+(?:-[a-z0-9]+)*";
// Exact occurrences, scoped to the declaration that owns each exception.
const allowedGrammar = [
  {
    file: "packages/contracts/src/content/entries.ts",
    owner: "export const contentEntryListQuerySchema",
    line: "v.regex(/^[a-z0-9]+(?:-[a-z0-9]+)*(?![\\s\\S])/u),",
    reason: "Strict-end query spelling is pinned in OpenAPI and checked for parity.",
  },
  {
    file: "packages/contracts/src/builds/build-site.ts",
    owner: "export const buildSiteIdentitySchema",
    line: "id: v.pipe(v.string(), v.minLength(1), v.maxLength(64), v.regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u)),",
    reason: "Build site IDs are a distinct identifier.",
  },
  {
    file: "apps/admin/src/app/router/router.ts",
    owner: "const modelKeyPattern",
    line: "const modelKeyPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;",
    reason: "Admin model keys are a distinct identifier.",
  },
];

const errorOwners = {
  LaceError: "packages/content/src/shared/errors.ts",
  InvariantError: "packages/content/src/shared/errors.ts",
  AccountError: "packages/domain/src/index.ts",
  RateLimitExceededError: "packages/domain/src/index.ts",
  ContractValidationError: "packages/contracts/src/errors/envelope.ts",
  classifyError: "packages/contracts/src/errors/classification.ts",
};

function violations(source, file) {
  const found = [];
  const errors = new RegExp(
    `\\b(?:const|let|function|class)\\s+(${Object.keys(errorOwners).join("|")})\\b`,
    "gu",
  );
  for (const match of source.matchAll(errors))
    if (errorOwners[match[1]] !== file)
      found.push(
        `${file}:${source.slice(0, match.index).split("\n").length}: duplicate ${match[1]}`,
      );
  if (/^packages\/(?:content|application)\/src\//u.test(file))
    for (const match of source.matchAll(/\bnew\s+Error\s*\(/gu))
      found.push(
        `${file}:${source.slice(0, match.index).split("\n").length}: raw Error construction`,
      );
  if (file.startsWith("packages/content/src/")) return found;
  const declaration = new RegExp(
    `\\b(?:const|let|type|interface|function|class)\\s+(${names.join("|")})\\b`,
    "gu",
  );
  for (const match of source.matchAll(declaration))
    found.push(`${file}:${source.slice(0, match.index).split("\n").length}: duplicate ${match[1]}`);
  const lines = source.split("\n");
  for (let i = 0; i < lines.length; i++) {
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
    const prefix = lines.slice(0, i + 1).join("\n");
    const owner = [...prefix.matchAll(/^(?:export )?const \w+/gmu)].at(-1)?.[0];
    if (
      !allowedGrammar.some(
        (entry) => entry.file === file && entry.owner === owner && entry.line === lines[i].trim(),
      )
    )
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
