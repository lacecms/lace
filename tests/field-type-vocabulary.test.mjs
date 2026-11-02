import { readFileSync, readdirSync } from "node:fs";
import { resolve, relative } from "node:path";
import { createScanner, SyntaxKind as K } from "typescript/unstable/ast";
import { expect, test } from "vitest";

const root = resolve(import.meta.dirname, "..");
// Read the authoritative declaration, so the guard grows with the vocabulary.
const declaration = readFileSync(resolve(root, "packages/content/src/index.ts"), "utf8");
const kinds = new Set(
  [...declaration.match(/export type FieldType =([\s\S]*?);/u)[1].matchAll(/"([^"]+)"/gu)].map(
    (match) => match[1],
  ),
);

function tokens(source) {
  const scanner = createScanner(true, undefined, source);
  const result = [];
  const templates = [];
  let braces = 0;
  for (;;) {
    const before = scanner.getTokenEnd();
    let kind = scanner.scan();
    if (kind === K.EndOfFile) break;
    if (kind === K.CloseBraceToken && templates.at(-1) === braces) {
      kind = scanner.reScanTemplateToken(false);
      if (kind === K.TemplateTail) templates.pop();
    } else if (kind === K.OpenBraceToken) braces++;
    else if (kind === K.CloseBraceToken) braces--;
    if (kind === K.TemplateHead) templates.push(braces);
    result.push({ kind, value: scanner.getTokenValue(), start: scanner.getTokenStart() });
    // The lexical scanner needs parser context for JSX/regex/hash tokens. Always advance.
    if (scanner.getTokenEnd() <= before) scanner.resetTokenState(before + 1);
  }
  return result;
}

function violations(source, file) {
  const scanned = tokens(source);
  const found = [];
  const report = (start, values) => {
    if (new Set(values.filter((value) => kinds.has(value))).size >= 2)
      found.push(`${file}:${source.slice(0, start).split("\n").length}`);
  };
  for (let i = 0; i < scanned.length; i++) {
    const token = scanned[i];
    if (token.kind === K.OpenBracketToken) {
      const values = [];
      let depth = 0;
      for (let j = i + 1; j < scanned.length; j++) {
        const child = scanned[j];
        if (child.kind === K.CloseBracketToken && depth === 0) break;
        if (child.kind === K.StringLiteral && depth === 0) values.push(child.value);
        if ([K.OpenBracketToken, K.OpenParenToken, K.OpenBraceToken].includes(child.kind)) depth++;
        if ([K.CloseBracketToken, K.CloseParenToken, K.CloseBraceToken].includes(child.kind))
          depth--;
      }
      report(token.start, values);
    }
    if (token.kind === K.StringLiteral && scanned[i + 1]?.kind === K.BarToken) {
      const values = [token.value];
      let j = i + 1;
      while (scanned[j]?.kind === K.BarToken && scanned[j + 1]?.kind === K.StringLiteral) {
        values.push(scanned[j + 1].value);
        j += 2;
      }
      report(token.start, values);
      i = j - 1;
    }
  }
  return found;
}

function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory())
      return entry.name === "test-support" || entry.name === "test" ? [] : sourceFiles(path);
    return /\.tsx?$/u.test(path) && !/\.(?:test|type-test)\./u.test(path) ? [path] : [];
  });
}

test("production code keeps field-kind lists in the authoritative declarations", () => {
  const files = ["packages", "apps"].flatMap((directory) =>
    readdirSync(resolve(root, directory), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .flatMap((entry) => {
        try {
          return sourceFiles(resolve(root, directory, entry.name, "src"));
        } catch (error) {
          if (error.code === "ENOENT") return [];
          throw error;
        }
      }),
  );
  const found = files.flatMap((path) => {
    const file = relative(root, path);
    if (file === "apps/admin/src/entities/content/field-types.ts") return [];
    let source = readFileSync(path, "utf8");
    if (file === "packages/content/src/index.ts") {
      // Canonical vocabulary and capability types, plus the existing single
      // block-settings declaration, are definitions rather than consumer copies.
      source = source
        .replace(/export type FieldType =[\s\S]*?(?=\/\*\* Options common)/u, (text) =>
          text.replace(/[^\n]/gu, " "),
        )
        .replace(/export const BLOCK_SETTING_FIELD_TYPES =[\s\S]*?\);/u, (text) =>
          text.replace(/[^\n]/gu, " "),
        );
    }
    return violations(source, file);
  });
  expect(found).toEqual([]);
});

for (const fixture of ["array", "set", "union", "comparison", "media-grid"]) {
  test(`vocabulary scanner identifies ${fixture} fixture with file and line`, () => {
    const file = `tests/fixtures/field-type-vocabulary/${fixture}.ts`;
    expect(violations(readFileSync(resolve(root, file), "utf8"), file)).toEqual(
      ["array", "set", "union"].includes(fixture) ? [`${file}:1`] : [],
    );
  });
}
