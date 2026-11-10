import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createScanner, SyntaxKind } from "typescript/unstable/ast";
import { expect, test } from "vitest";
import { importsIn } from "../scripts/check-boundaries.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const blocked = (name) => name.startsWith("@tiptap/") || name.startsWith("@dnd-kit/");

// The boundary scanner covers static imports and re-exports. Also include
// literal dynamic imports so lazy-loading cannot hide an editor dependency.
function dynamicImports(file) {
  const scanner = createScanner(true, undefined, readFileSync(file, "utf8"));
  const result = [];
  for (;;) {
    const before = scanner.getTokenEnd();
    const token = scanner.scan();
    if (token === SyntaxKind.EndOfFile) break;
    if (scanner.getTokenEnd() <= before) scanner.resetTokenState(before + 1);
    if (token !== SyntaxKind.ImportKeyword) continue;
    if (scanner.scan() !== SyntaxKind.OpenParenToken) continue;
    if (scanner.scan() === SyntaxKind.StringLiteral) result.push(scanner.getTokenValue());
  }
  return result;
}

function forbiddenImports(entry) {
  const seen = new Set();
  const pending = [entry];
  const found = new Set();
  while (pending.length) {
    const file = pending.pop();
    if (seen.has(file)) continue;
    seen.add(file);
    for (const specifier of [...importsIn(file), ...dynamicImports(file)]) {
      if (blocked(specifier)) found.add(specifier);
      if (!specifier.startsWith(".")) continue;
      const path = resolve(dirname(file), specifier.replace(/\?.*$/u, ""));
      const base = path.replace(/\.(?:c|m)?js$/u, "");
      const target = [base + ".ts", base + ".tsx", path, join(path, "index.ts")].find(existsSync);
      if (target && [".ts", ".tsx"].includes(extname(target))) pending.push(target);
    }
  }
  return [...found].sort();
}

test("navigation and content graph does not load rich-text or drag-and-drop packages", () => {
  for (const entry of [
    "apps/admin/src/widgets/admin-shell/SidebarNav/SidebarNav.tsx",
    "apps/admin/src/entities/content/index.ts",
  ])
    expect(forbiddenImports(join(root, entry))).toEqual([]);
});

test("detects static and dynamic editor imports through a transitive module", () => {
  const directory = mkdtempSync(join(tmpdir(), "lace-sidebar-graph-"));
  try {
    mkdirSync(join(directory, "child"));
    writeFileSync(join(directory, "index.ts"), 'export * from "./child/index.js";');
    writeFileSync(
      join(directory, "child/index.ts"),
      'import "@tiptap/core"; export const load = () => import("@dnd-kit/core");',
    );
    expect(forbiddenImports(join(directory, "index.ts"))).toEqual([
      "@dnd-kit/core",
      "@tiptap/core",
    ]);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
