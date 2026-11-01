import { test, expect } from "vitest";
import {
  cpSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repository = fileURLToPath(new URL("../", import.meta.url));
const rootDocuments = ["README.md", "DEVELOPMENT.md", "AGENTS.md", "backlog.md"];
const indexes = ["docs/README.md", "docs/adr/README.md"];

function markdownFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return markdownFiles(path);
    return entry.name.endsWith(".md") ? [path] : [];
  });
}

function withoutCode(source) {
  return source
    .replace(/^ {0,3}(`{3,}|~{3,})[^\n]*\n[\s\S]*?^ {0,3}\1\s*$/gm, "")
    .replace(/(`+)[^`\n]*?\1/g, "");
}

function linkTargets(source) {
  const text = withoutCode(source);
  const targets = [];
  const definitions = new Map();
  const normalize = (label) => label.trim().replace(/\s+/g, " ").toLowerCase();
  const destination = String.raw`(?:<([^>\n]+)>|((?:\\.|[^\s()\\]|\([^()\n]*\))+))`;
  for (const match of text.matchAll(
    new RegExp(String.raw`^ {0,3}\[([^\]\n]+)\]:\s*${destination}`, "gm"),
  )) {
    definitions.set(normalize(match[1]), match[2] ?? match[3]);
    targets.push(match[2] ?? match[3]);
  }
  for (const match of text.matchAll(
    new RegExp(String.raw`\[[^\]\n]*\]\(\s*${destination}(?:\s+[^\n]*?)?\s*\)`, "g"),
  )) {
    targets.push(match[1] ?? match[2]);
  }
  for (const match of text.matchAll(/\[([^\]\n]*)\](?:\[([^\]\n]*)\])?/g)) {
    const target = definitions.get(normalize(match[2] || match[1]));
    if (target) targets.push(target);
  }
  return targets;
}

function resolveTarget(root, document, target) {
  if (/^[a-z][a-z\d+.-]*:/i.test(target)) return null;
  const path = target.split(/[?#]/, 1)[0];
  if (!path) return null;
  const decoded = decodeURIComponent(path.replace(/\\([() ])/g, "$1"));
  return decoded.startsWith("/")
    ? resolve(root, `.${decoded}`)
    : resolve(dirname(document), decoded);
}

function indexRows(root, index, statuses) {
  const files = new Set();
  for (const line of readFileSync(join(root, index), "utf8").split("\n")) {
    if (!line.startsWith("|")) continue;
    const cells = line
      .split("|")
      .slice(1, -1)
      .map((cell) => cell.trim());
    const status = cells.find((cell) => statuses.includes(cell));
    if (!status) continue;
    for (const target of linkTargets(line)) {
      const file = resolveTarget(root, join(root, index), target);
      if (file) files.add(file);
    }
  }
  return files;
}

function documentationErrors(root) {
  const errors = [];
  const documents = markdownFiles(join(root, "docs"));
  for (const document of [...rootDocuments.map((name) => join(root, name)), ...documents]) {
    for (const target of linkTargets(readFileSync(document, "utf8"))) {
      const resolved = resolveTarget(root, document, target);
      if (resolved && !existsSync(resolved))
        errors.push(`${relative(root, document)}: missing target ${target}`);
    }
  }
  const indexed = indexRows(root, indexes[0], ["authoritative", "internal note", "historical"]);
  const adrIndexed = indexRows(root, indexes[1], ["accepted", "amended", "superseded"]);
  for (const document of documents) {
    const name = relative(root, document);
    if (!indexes.includes(name) && !indexed.has(document))
      errors.push(`${name}: absent from ${indexes[0]}`);
    if (dirname(name) === "docs/adr" && name !== indexes[1] && !adrIndexed.has(document))
      errors.push(`${name}: absent from ${indexes[1]}`);
  }
  return errors;
}

test("internal documentation links resolve and documentation/ADR indexes are complete", () => {
  expect(documentationErrors(repository)).toEqual([]);
});

test("link parsing covers inline, reference, encoded and anchored targets without code examples", () => {
  const targets = linkTargets(
    [
      '[inline](guide.md#section) [nested](a_(b).md) [spaced](<a%20b.md> "title")',
      "[full][ref] [ref][] [ref]",
      '[ref]: ./reference.md#heading "Title"',
      "`[example](missing.md)`",
      "```md\n[example](missing.md)\n```",
    ].join("\n"),
  );
  expect(new Set(targets)).toEqual(
    new Set(["guide.md#section", "a_(b).md", "a%20b.md", "./reference.md#heading"]),
  );
  expect(resolveTarget(repository, join(repository, "docs/README.md"), "a%20b.md#heading")).toBe(
    join(repository, "docs/a b.md"),
  );
});

test("the guard rejects dangling links and unindexed documents and ADRs in a scratch copy", () => {
  const scratch = mkdtempSync(join(tmpdir(), "lace-docs-links-"));
  try {
    cpSync(join(repository, "docs"), join(scratch, "docs"), { recursive: true });
    for (const entry of readdirSync(repository)) {
      if (entry === "docs") continue;
      if (rootDocuments.includes(entry)) cpSync(join(repository, entry), join(scratch, entry));
      else symlinkSync(join(repository, entry), join(scratch, entry));
    }
    expect(documentationErrors(scratch)).toEqual([]);
    const readme = join(scratch, "README.md");
    const original = readFileSync(readme, "utf8");
    writeFileSync(readme, `${original}\n[dangling](docs/missing.md)\n`);
    expect(documentationErrors(scratch)).toContain("README.md: missing target docs/missing.md");
    writeFileSync(readme, original);
    const note = join(scratch, "docs/temp.md");
    writeFileSync(note, "# Unindexed note\n");
    expect(documentationErrors(scratch)).toContain("docs/temp.md: absent from docs/README.md");
    rmSync(note);
    const adr = "docs/adr/0099-temp.md";
    writeFileSync(join(scratch, adr), "# Unindexed ADR\n");
    expect(documentationErrors(scratch)).toContain(`${adr}: absent from docs/README.md`);
    expect(documentationErrors(scratch)).toContain(`${adr}: absent from docs/adr/README.md`);
    // Listing the ADR only in the general index must still fail the ADR index.
    const index = join(scratch, indexes[0]);
    writeFileSync(
      index,
      `${readFileSync(index, "utf8")}\n| [0099](adr/0099-temp.md) | authoritative | Test |\n`,
    );
    expect(documentationErrors(scratch)).toEqual([`${adr}: absent from docs/adr/README.md`]);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
});
