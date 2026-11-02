import { readFileSync, readdirSync } from "node:fs";
import { resolve, relative } from "node:path";
import { expect, test } from "vitest";

const root = resolve(import.meta.dirname, "..");
const names = [
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
    file: "packages/contracts/src/index.ts",
    owner: "export const contentEntryListQuerySchema",
    line: "v.regex(/^[a-z0-9]+(?:-[a-z0-9]+)*(?![\\s\\S])/u),",
    reason: "Strict-end query spelling is pinned in OpenAPI and checked for parity.",
  },
  {
    file: "packages/contracts/src/index.ts",
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

function violations(source, file) {
  if (file.startsWith("packages/content/src/")) return [];
  const found = [];
  const declaration = new RegExp(
    `\\b(?:const|let|type|interface|function|class)\\s+(${names.join("|")})\\b`,
    "gu",
  );
  for (const match of source.matchAll(declaration))
    found.push(`${file}:${source.slice(0, match.index).split("\n").length}: duplicate ${match[1]}`);
  const lines = source.split("\n");
  for (let i = 0; i < lines.length; i++) {
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
