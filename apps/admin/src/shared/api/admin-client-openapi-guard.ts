import { API } from "typescript/unstable/sync";
import {
  isBinaryExpression,
  isCallExpression,
  isConditionalExpression,
  isIdentifier,
  isFunctionDeclaration,
  isImportDeclaration,
  isReturnStatement,
  isNewExpression,
  isObjectLiteralExpression,
  isParenthesizedExpression,
  isPropertyAccessExpression,
  isPropertyAssignment,
  isStringLiteral,
  isShorthandPropertyAssignment,
  isSpreadAssignment,
  isTemplateExpression,
  isVariableDeclaration,
  SyntaxKind,
  type Node,
} from "typescript/unstable/ast";
import { readdirSync } from "node:fs";
import { resolve } from "node:path";

type OpenApi = {
  paths: Record<string, Record<string, unknown>>;
  components?: { parameters?: Record<string, unknown> };
};
type Operation = {
  path: string;
  method: string;
  query: string[];
  location: string;
  clientMethod?: string;
};
const auth: Record<string, readonly string[]> = {
  "POST /api/auth/sign-in/email": [],
  "POST /api/auth/sign-out": [],
  "GET /api/auth/oauth2/authorize": ["transaction"],
  "POST /api/auth/oauth2/consent": [],
};
function walk(node: Node, visit: (node: Node) => void): void {
  visit(node);
  node.forEachChild((child) => {
    walk(child, visit);
  });
}
function fail(node: Node, message: string): never {
  const file = node.getSourceFile();
  const loc = file.getLineAndCharacterOfPosition(node.getStart());
  throw new Error(`${file.fileName}:${loc.line + 1}:${loc.character + 1}: ${message}`);
}
function strings(node: Node, scope: Node, seen = new Set<string>()): string[] {
  if (isStringLiteral(node)) return [node.text];
  if (isParenthesizedExpression(node)) return strings(node.expression, scope, seen);
  if (isTemplateExpression(node)) {
    let values = [node.head.text];
    for (const span of node.templateSpans) {
      const expressions = strings(span.expression, scope, seen);
      values = values.flatMap((left) =>
        expressions.map((right) => left + right + span.literal.text),
      );
    }
    return values;
  }
  if (isConditionalExpression(node))
    return [...strings(node.whenTrue, scope, seen), ...strings(node.whenFalse, scope, seen)];
  if (isBinaryExpression(node) && node.operatorToken.kind === SyntaxKind.PlusToken) {
    return strings(node.left, scope, seen).flatMap((left) =>
      strings(node.right, scope, seen).map((right) => left + right),
    );
  }
  if (
    isCallExpression(node) &&
    isIdentifier(node.expression) &&
    node.expression.text === "encodeURIComponent" &&
    node.arguments.length === 1 &&
    isIdentifier(node.arguments[0]!)
  )
    return ["~value~"];
  if (
    isCallExpression(node) &&
    isPropertyAccessExpression(node.expression) &&
    node.expression.getText() === "search.toString" &&
    node.arguments.length === 0
  )
    return ["~query~"];
  if (isIdentifier(node) && node.text === "search") return ["~query~"];
  if (isIdentifier(node) && !seen.has(node.text)) {
    const name = node.text;
    let initializer: Node | undefined;
    walk(scope, (child) => {
      if (isVariableDeclaration(child) && isIdentifier(child.name) && child.name.text === name)
        initializer = child.initializer;
    });
    if (initializer !== undefined) return strings(initializer, scope, new Set([...seen, name]));
  }
  return fail(node, `unsupported route expression: ${node.getText()}`);
}
function method(call: Node, args: readonly Node[], kind: string): string {
  if (kind !== "request") return "POST";
  const init = args[2];
  if (init === undefined) return "GET";
  if (isConditionalExpression(init)) {
    const left = method(call, [args[0]!, args[1]!, init.whenTrue], kind);
    const right = method(call, [args[0]!, args[1]!, init.whenFalse], kind);
    if (left !== right) return fail(call, "conditional request methods differ");
    return left;
  }
  if (!isObjectLiteralExpression(init)) return fail(init, "unsupported request options");
  let value = "GET";
  for (const prop of init.properties) {
    if (isShorthandPropertyAssignment(prop) && prop.name.getText() === "signal") continue;
    if (
      isSpreadAssignment(prop) &&
      prop.getText().replace(/\s+/gu, "") === "...(signal===undefined?{}:{signal})"
    )
      continue;
    if (!isPropertyAssignment(prop)) return fail(prop, "unsupported request option");
    if (prop.name.getText() === "method") {
      if (!isStringLiteral(prop.initializer)) return fail(prop, "unsupported HTTP method");
      value = prop.initializer.text.toUpperCase();
    }
  }
  return value;
}
function routeMatch(path: string, pattern: string): boolean {
  const parts = path.split("/"),
    expected = pattern.split("/");
  return (
    parts.length === expected.length &&
    parts.every(
      (part, index) =>
        part === expected[index] || (part === "~value~" && /^\{[^{}]+\}$/u.test(expected[index]!)),
    )
  );
}
function parameters(doc: OpenApi, items: unknown): string[] {
  if (!Array.isArray(items)) return [];
  return items.flatMap((item: unknown) => {
    if (typeof item !== "object" || item === null) throw new Error("Invalid OpenAPI parameter");
    const value = item as Record<string, unknown>;
    if (typeof value.$ref === "string") {
      const prefix = "#/components/parameters/";
      if (!value.$ref.startsWith(prefix))
        throw new Error(`Unsupported parameter reference ${value.$ref}`);
      return parameters(doc, [doc.components?.parameters?.[value.$ref.slice(prefix.length)]]);
    }
    return value.in === "query" && typeof value.name === "string" ? [value.name] : [];
  });
}
export function checkOperation(doc: OpenApi, operation: Operation): void {
  const key = `${operation.method} ${operation.path}`;
  if (operation.path.startsWith("/api/auth/")) {
    const allowed = auth[key];
    if (!allowed) throw new Error(`${operation.location}: unlisted auth operation ${key}`);
    for (const name of operation.query)
      if (!allowed.includes(name))
        throw new Error(`${operation.location}: unlisted auth query ${name} in ${key}`);
    return;
  }
  if (!operation.path.startsWith("/api/v1/"))
    throw new Error(`${operation.location}: unknown namespace ${key}`);
  const matches = Object.keys(doc.paths).filter((pattern) => routeMatch(operation.path, pattern));
  if (matches.length !== 1)
    throw new Error(
      `${operation.location}: OpenAPI path ${operation.path} matches ${matches.length} paths`,
    );
  const pathItem = doc.paths[matches[0]!]!;
  const value = pathItem[operation.method.toLowerCase()];
  if (typeof value !== "object" || value === null)
    throw new Error(`${operation.location}: OpenAPI has no ${key}`);
  const allowed = [
    ...parameters(doc, pathItem.parameters),
    ...parameters(doc, (value as Record<string, unknown>).parameters),
  ];
  for (const name of operation.query)
    if (!allowed.includes(name))
      throw new Error(`${operation.location}: OpenAPI has no query ${name} for ${key}`);
}
export function extractOperations(files: readonly string[]): Operation[] {
  const api = new API({ cwd: process.cwd() });
  try {
    const snapshot = api.updateSnapshot({ openFiles: [...files] });
    const operations: Operation[] = [];
    for (const file of files) {
      const project = snapshot.getDefaultProjectForFile(file);
      const source = project?.program.getSourceFile(file);
      if (!project || !source) throw new Error(`Cannot parse ${file}`);
      const factories = source.statements.filter(isFunctionDeclaration);
      if (factories.length !== 1 || !factories[0]?.body)
        fail(source, "expected exactly one client factory");
      const returns = factories[0].body.statements.filter(isReturnStatement);
      if (
        returns.length !== 1 ||
        !returns[0]?.expression ||
        !isObjectLiteralExpression(returns[0].expression)
      )
        fail(factories[0], "client factory must return an object literal");
      for (const property of returns[0].expression.properties) {
        if (
          !isPropertyAssignment(property) ||
          property.initializer.kind !== SyntaxKind.ArrowFunction ||
          !isIdentifier(property.name)
        )
          fail(property, "unsupported client method declaration");
        const calls: Node[] = [];
        const queryNames = new Set<string>();
        walk(property.initializer, (node) => {
          if (
            isIdentifier(node) &&
            ["fetcher", "request", "postJson", "upload"].includes(node.text)
          ) {
            const parent = node.parent;
            const callee =
              isCallExpression(parent) &&
              parent.expression === node &&
              ["request", "postJson", "upload"].includes(node.text);
            const fetcherArgument =
              node.text === "fetcher" &&
              isCallExpression(parent) &&
              parent.arguments[0] === node &&
              ["request", "postJson"].includes(parent.expression.getText());
            if (!callee && !fetcherArgument) fail(node, "unsupported transport reference");
          }
          if (isIdentifier(node) && node.text === "search") {
            const parent = node.parent;
            const declared = isVariableDeclaration(parent) && parent.name === node;
            const member =
              isPropertyAccessExpression(parent) &&
              parent.expression === node &&
              ["size", "set", "append", "toString"].includes(parent.name.getText());
            const propertyName = isPropertyAccessExpression(parent) && parent.name === node;
            const interpolation = parent.kind === SyntaxKind.TemplateSpan;
            if (!declared && !member && !propertyName && !interpolation)
              fail(node, "unsupported query builder use");
          }
          if (isNewExpression(node) && node.expression.getText() === "XMLHttpRequest")
            fail(node, "direct transport is not supported");
          if (isNewExpression(node) && node.expression.getText() === "URLSearchParams") {
            if ((node.arguments?.length ?? 0) > 1)
              fail(node, "unsupported URLSearchParams initializer");
            if (
              node.arguments?.length === 1 &&
              !node.arguments[0]!.getText()
                .replace(/\s+/gu, "")
                .match(
                  /^Object\.entries\(query\)\.filter\(\(\[,value\]\)=>value!==undefined\)\.map\(\(\[key,value\]\)=>\[key,String\(value\)\]\)$/u,
                )
            )
              fail(node, "unsupported URLSearchParams initializer");
          }
          if (!isCallExpression(node)) return;
          const name = node.expression.getText();
          if (["request", "postJson", "upload"].includes(name)) calls.push(node);
          if (
            ["fetch", "fetcher", "globalThis.fetch", "window.fetch", "XMLHttpRequest"].includes(
              name,
            )
          )
            fail(node, "direct transport is not supported");
          if (
            isPropertyAccessExpression(node.expression) &&
            node.expression.expression.getText() === "search"
          ) {
            const member = node.expression.name.text;
            if (member === "set" || member === "append") {
              const first = node.arguments[0];
              if (!first || !isStringLiteral(first)) fail(node, "query name must be a literal");
              queryNames.add(first.text);
            } else if (member !== "toString") fail(node, "unsupported query operation");
          }
          if (name === "Object.entries") {
            if (node.arguments.length !== 1 || node.arguments[0]!.getText() !== "query")
              fail(node, "unsupported object query");
            const type = project.checker.getTypeAtLocation(node.arguments[0]!);
            if (!type) fail(node, "cannot resolve object query type");
            if (project.checker.getIndexInfosOfType(type).length)
              fail(node, "object query has an open index signature");
            const properties = project.checker.getPropertiesOfType(type);
            if (!properties.length) fail(node, "object query has no known properties");
            for (const p of properties) queryNames.add(p.name);
          }
        });
        if (calls.length !== 1 || !isCallExpression(calls[0]!))
          fail(property, `expected one recognized transport call, found ${calls.length}`);
        const call = calls[0];
        if (!isCallExpression(call)) fail(property, "unsupported transport call");
        const kind = call.expression.getText();
        const pathNode = call.arguments[kind === "upload" ? 0 : 1];
        if (!pathNode) fail(call, "missing route");
        const loc = source.getLineAndCharacterOfPosition(call.getStart());
        const location = `${file}:${loc.line + 1}:${loc.character + 1}`;
        for (const result of strings(pathNode, property)) {
          const [path = "", query = ""] = result.split("?");
          const names = new Set<string>();
          if (query.includes("~query~")) for (const name of queryNames) names.add(name);
          for (const param of query.split("&"))
            if (param && !param.includes("~query~")) names.add(param.split("=")[0]!);
          if (queryNames.size && !query.includes("~query~")) {
            // Optional query branches can omit the search string; another branch must carry it.
            const all = strings(pathNode, property);
            if (!all.some((value) => value.includes("~query~")))
              fail(pathNode, "query builder is not present in route");
          }
          operations.push({
            path,
            method: method(call, call.arguments, kind),
            query: [...names],
            location,
            clientMethod: property.name.text,
          });
        }
      }
    }
    return operations;
  } finally {
    api.close();
  }
}
export function clientSourceFiles(root: string): string[] {
  const directory = resolve(root, "apps/admin/src/shared/api/admin-client");
  return readdirSync(directory)
    .filter((file) => file.endsWith(".ts") && !file.endsWith(".test.ts"))
    .map((file) => resolve(directory, file));
}

/** Reject facade changes that could bypass the mechanically inspected domain factories. */
export function checkFacade(facade: string, files: readonly string[]): void {
  const api = new API({ cwd: process.cwd() });
  try {
    const snapshot = api.updateSnapshot({ openFiles: [facade] });
    const source = snapshot.getDefaultProjectForFile(facade)?.program.getSourceFile(facade);
    if (!source) throw new Error(`Cannot parse ${facade}`);
    const expected = new Map(
      files.map((file) => {
        const name = file.slice(file.lastIndexOf("/") + 1, -3);
        return [`${name}Client`, `./admin-client/${name}.js`];
      }),
    );
    const found = new Set<string>();
    for (const statement of source.statements.filter(isImportDeclaration)) {
      const module = statement.moduleSpecifier.getText().slice(1, -1);
      for (const [name, expectedModule] of expected) {
        if (
          module === expectedModule &&
          statement.importClause?.getText().replace(/\s+/gu, "") === `{${name}}`
        )
          found.add(name);
      }
    }
    if (found.size !== expected.size)
      fail(source, "client factory imports do not match source files");
    const factory = source.statements
      .filter(isFunctionDeclaration)
      .find((item) => item.name?.text === "createAdminClient");
    if (!factory?.body) fail(source, "missing createAdminClient");
    const returns = factory.body.statements.filter(isReturnStatement);
    const expr = returns[0]?.expression;
    if (
      returns.length !== 1 ||
      !expr ||
      !isCallExpression(expr) ||
      expr.expression.getText() !== "Object.freeze" ||
      expr.arguments.length !== 1 ||
      !isObjectLiteralExpression(expr.arguments[0]!)
    )
      fail(factory, "unsupported client composition");
    const composed = new Set<string>();
    for (const prop of expr.arguments[0].properties) {
      if (
        !isSpreadAssignment(prop) ||
        !isCallExpression(prop.expression) ||
        !isIdentifier(prop.expression.expression)
      )
        fail(prop, "unsupported client composition member");
      const name = prop.expression.expression.text;
      if (!expected.has(name) || composed.has(name))
        fail(prop, "unknown or duplicate client factory");
      composed.add(name);
    }
    if (composed.size !== expected.size) fail(factory, "client composition omits a factory");
    walk(factory.body, (node) => {
      if (
        isCallExpression(node) &&
        [
          "request",
          "postJson",
          "upload",
          "fetch",
          "fetcher",
          "window.fetch",
          "globalThis.fetch",
        ].includes(node.expression.getText())
      )
        fail(node, "transport outside domain factory");
      if (isNewExpression(node) && node.expression.getText() === "XMLHttpRequest")
        fail(node, "transport outside domain factory");
    });
  } finally {
    api.close();
  }
}
