import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { createScanner, SyntaxKind } from "typescript/unstable/ast";

const roadmapCode =
  /\b(?:CE|SM|LIST|RF|MCP|CQ|M|IMAGES|IMPORT|MEDIA)\d+[A-Z]?\b|\bSTEP[\s_-]*\d+[A-Z]?\b|\b\d{2}[A-H]\b/iu;
const declarations = new Set(["test", "it", "describe", "suite"]);
const setupModifiers = new Set(["each", "skipIf", "runIf"]);

// The TypeScript scanner skips comments and recognizes strings without treating
// test data, comments, or interpolation expressions as title text.
function tokensOf(source) {
  const scanner = createScanner(true, undefined, source);
  const tokens = [];
  const templates = [];
  let kind;
  let position = -1;
  while ((kind = scanner.scan()) !== SyntaxKind.EndOfFile) {
    if (kind === SyntaxKind.CloseBraceToken && templates.length) {
      const top = templates.length - 1;
      if (templates[top] === 0) {
        kind = scanner.reScanTemplateToken(false);
        if (kind === SyntaxKind.TemplateTail) templates.pop();
      } else templates[top]--;
    } else if (kind === SyntaxKind.OpenBraceToken && templates.length) {
      templates[templates.length - 1]++;
    } else if (kind === SyntaxKind.TemplateHead) {
      templates.push(0);
    }
    if (scanner.getTokenEnd() <= position) scanner.resetTokenState(position + 1);
    position = scanner.getTokenEnd();
    tokens.push({ kind, text: scanner.getTokenText(), value: scanner.getTokenValue() });
  }
  return tokens;
}

function closeParen(tokens, start) {
  let depth = 0;
  for (let i = start; i < tokens.length; i++) {
    if (tokens[i].kind === SyntaxKind.OpenParenToken) depth++;
    if (tokens[i].kind === SyntaxKind.CloseParenToken && --depth === 0) return i;
  }
  return -1;
}

export function findBadTestTitles(source) {
  const tokens = tokensOf(source);
  const found = [];
  for (let i = 0; i < tokens.length; i++) {
    if (!declarations.has(tokens[i].text) || tokens[i - 1]?.kind === SyntaxKind.DotToken) continue;
    let j = i + 1;
    let setup = false;
    while (tokens[j]?.kind === SyntaxKind.DotToken) {
      setup ||= setupModifiers.has(tokens[j + 1]?.text);
      j += 2;
    }
    if (setup && tokens[j]?.kind === SyntaxKind.OpenParenToken) {
      j = closeParen(tokens, j) + 1;
      if (!j) continue;
    }
    if (setup && tokens[j]?.kind === SyntaxKind.NoSubstitutionTemplateLiteral) j++;
    else if (setup && tokens[j]?.kind === SyntaxKind.TemplateHead) {
      let depth = 1;
      j++;
      while (j < tokens.length && depth) {
        if (tokens[j].kind === SyntaxKind.TemplateHead) depth++;
        if (tokens[j].kind === SyntaxKind.TemplateTail) depth--;
        j++;
      }
    }
    if (tokens[j]?.kind !== SyntaxKind.OpenParenToken) continue;
    const title = tokens[j + 1];
    if (!title) continue;
    let text;
    if (
      title.kind === SyntaxKind.StringLiteral ||
      title.kind === SyntaxKind.NoSubstitutionTemplateLiteral
    ) {
      text = title.value;
    } else if (title.kind === SyntaxKind.TemplateHead) {
      const parts = [title.value];
      let depth = 1;
      for (let k = j + 2; k < tokens.length && depth; k++) {
        const token = tokens[k];
        if (token.kind === SyntaxKind.TemplateHead) depth++;
        else if (token.kind === SyntaxKind.TemplateTail) {
          if (depth === 1) parts.push(token.value);
          depth--;
        } else if (token.kind === SyntaxKind.TemplateMiddle && depth === 1) parts.push(token.value);
      }
      text = parts.join(" ");
    }
    if (text && roadmapCode.test(text)) found.push(text);
  }
  return found;
}

async function testFiles(root, directory) {
  const entries = await readdir(join(root, directory), { withFileTypes: true }).catch((error) => {
    if (error.code === "ENOENT") return [];
    throw error;
  });
  const paths = await Promise.all(
    entries.map(async (entry) => {
      const path = `${directory}/${entry.name}`;
      if (entry.isDirectory()) {
        if (["node_modules", "dist", "fixtures", ".astro"].includes(entry.name)) return [];
        return testFiles(root, path);
      }
      return entry.isFile() && /(?:\.test|\.e2e)\.[cm]?[jt]sx?$/u.test(entry.name) ? [path] : [];
    }),
  );
  return paths.flat();
}

export async function inspectTestTitles(root) {
  const paths = (
    await Promise.all(["tests", "apps", "packages"].map((dir) => testFiles(root, dir)))
  ).flat();
  const reports = [];
  for (const path of paths) {
    const source = await readFile(join(root, path), "utf8");
    try {
      reports.push(...findBadTestTitles(source).map((title) => `${path}: ${title}`));
    } catch (error) {
      throw new Error(`Cannot inspect ${path}`, { cause: error });
    }
  }
  return reports;
}
