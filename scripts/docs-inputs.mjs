import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
const require = createRequire(new URL("../apps/docs/package.json", import.meta.url));
const { parseAllDocuments } = require(process.env.DOCS_YAML_MODULE || "yaml");
export function yamlDocuments(text) {
  return parseAllDocuments(text).map((doc) => {
    if (doc.errors.length) throw new Error(`Invalid YAML: ${doc.errors[0].message}`);
    return doc.toJSON();
  });
}
export function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, stable(value[key])]),
    );
  return value;
}
export function lockClosure(lock) {
  if (lock.lockfileVersion !== "9.0" && lock.lockfileVersion !== 9)
    throw new Error("Unsupported documentation lockfile version");
  const importer = lock.importers?.["apps/docs"];
  if (!importer || !lock.packages || !lock.snapshots)
    throw new Error("Missing documentation lock metadata");
  const snapshots = {},
    packages = {},
    names = new Set();
  function visit(name, reference) {
    if (typeof reference !== "string" || /^(?:link|file|workspace):/.test(reference))
      throw new Error(`Unsupported docs dependency ${name}: ${reference}`);
    // pnpm aliased references already include a package name.
    const key =
      reference.startsWith("@") || /^[^@]+@/.test(reference.split("(")[0])
        ? reference
        : `${name}@${reference}`;
    if (snapshots[key]) return;
    const snapshot = lock.snapshots[key];
    const base = key.split("(")[0];
    if (!snapshot || !lock.packages[base])
      throw new Error(`Unresolved documentation dependency ${key}`);
    snapshots[key] = snapshot;
    packages[base] = lock.packages[base];
    names.add(base.slice(0, base.lastIndexOf("@")));
    for (const [child, version] of Object.entries({
      ...snapshot.dependencies,
      ...snapshot.optionalDependencies,
    }))
      visit(child, version);
  }
  for (const group of ["dependencies", "devDependencies", "optionalDependencies"])
    for (const [name, item] of Object.entries(importer[group] || {})) visit(name, item.version);
  // Root Turbo orchestrates the app's public build command.
  const turbo = lock.importers["."]?.devDependencies?.turbo;
  if (!turbo) throw new Error("Missing pinned Turbo dependency");
  visit("turbo", turbo.version);
  const overrides = Object.fromEntries(
    Object.entries(lock.overrides || {}).filter(([selector]) =>
      [...names].some((name) =>
        selector.split(">").some((part) => part === name || part.startsWith(`${name}@`)),
      ),
    ),
  );
  return {
    lockfileVersion: lock.lockfileVersion,
    importer,
    turbo,
    snapshots,
    packages,
    settings: lock.settings,
    overrides,
    names: [...names].sort(),
  };
}
export function fingerprint(read, list) {
  const json = (path) => JSON.parse(read(path));
  const documents = yamlDocuments(read("pnpm-lock.yaml"));
  const lock = documents.find((doc) => doc.importers?.["apps/docs"]);
  if (!lock) throw new Error("No docs importer in lockfile");
  const closure = lockClosure(lock);
  const workspace = yamlDocuments(read("pnpm-workspace.yaml"))[0];
  const manifest = json("package.json");
  const turbo = json("turbo.json");
  const inputs = Object.fromEntries(
    list
      .filter(
        (path) =>
          (path.startsWith("apps/docs/") &&
            !/(?:^|\/)(?:node_modules|dist|\.astro|\.turbo)\//.test(path) &&
            path !== "apps/docs/public/reference/openapi.json") ||
          path.startsWith("scripts/docs-") ||
          path === ".github/workflows/docs-pages.yml" ||
          path === "apps/api/openapi/api-v1.json" ||
          path === ".oxlintrc.json" ||
          path === ".oxfmtrc.json",
      )
      .sort()
      .map((path) => [path, read(path)]),
  );
  const catalog = Object.fromEntries(
    closure.names
      .filter((name) => name in (workspace.catalog || {}))
      .map((name) => [name, workspace.catalog[name]]),
  );
  const allowBuilds = Object.fromEntries(
    Object.entries(workspace.allowBuilds || {}).filter(([name]) => closure.names.includes(name)),
  );
  const value = {
    inputs,
    closure,
    catalog,
    allowBuilds,
    workspace: {
      packages: workspace.packages,
      onlyBuiltDependencies: workspace.onlyBuiltDependencies?.filter((name) =>
        closure.names.includes(name),
      ),
      ignoredBuiltDependencies: workspace.ignoredBuiltDependencies?.filter((name) =>
        closure.names.includes(name),
      ),
    },
    manifest: {
      packageManager: manifest.packageManager,
      engines: manifest.engines,
      scripts: Object.fromEntries(
        Object.entries(manifest.scripts).filter(([name]) => name.startsWith("docs:")),
      ),
    },
    turbo: {
      globalDependencies: turbo.globalDependencies,
      globalEnv: turbo.globalEnv,
      task: turbo.tasks["@lacecms/app-docs#build"],
      build: turbo.tasks.build,
    },
    packageManagerLock: documents.filter((doc) => !doc.importers?.["apps/docs"]),
  };
  return createHash("sha256")
    .update(JSON.stringify(stable(value)))
    .digest("hex");
}
export function gitFingerprint(sha, root = process.cwd()) {
  const git = (...args) =>
    execFileSync("git", args, { cwd: root, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
  const files = git("ls-tree", "-r", "--name-only", sha).trim().split("\n");
  return fingerprint((path) => git("show", `${sha}:${path}`), files);
}
export function workingFingerprint(root = process.cwd()) {
  const files = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], {
    cwd: root,
    encoding: "utf8",
  })
    .trim()
    .split("\n");
  return fingerprint((path) => readFileSync(resolve(root, path), "utf8"), files);
}
