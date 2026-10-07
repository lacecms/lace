import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { platformReleaseVersion } from "./platform-release-version.mjs";

/** Delivered consumer guides whose versioned coordinates must name the candidate. */
export const RELEASE_GUIDES = [
  "packages/create-lace/README.md",
  "packages/create-lace/templates/README.md",
  "packages/create-lace/templates/docs/lace-astro-site.md",
  "packages/create-lace/templates/docs/lace-cloudflare.md",
  "packages/create-lace/templates/docs/lace-compose-dev.md",
  "packages/create-lace/templates/docs/lace-compose-production.md",
  "packages/create-lace/templates/docs/lace-operations.md",
];
/** Minimum-only engine declarations; reproducibility pins live in packageManager, CI and images. */
export const ENGINE_MINIMUMS = Object.freeze({ node: ">=24.12.0", pnpm: ">=12" });
export const RELEASE_DOCKERFILES = ["apps/api/Dockerfile", "apps/builder/Dockerfile"];
const COORDINATE =
  /(?:create[ -]lace@|@lacecms\/[a-z-]+@|ghcr\.io\/lacecms\/(?:api|builder):)(\d+\.\d+\.\d+(?:-[0-9A-Za-z]+(?:\.[0-9A-Za-z]+)*)?)/gu;

export const readJson = async (path) => JSON.parse(await readFile(path, "utf8"));
export const packageName = (directory) =>
  directory === "create-lace" ? directory : `@lacecms/${directory}`;

async function readRegistryRequirements(root) {
  const requirements = {};
  for (const framework of await readdir(join(root, "registry"), { withFileTypes: true })) {
    if (!framework.isDirectory()) continue;
    for (const item of await readdir(join(root, "registry", framework.name))) {
      const file = `registry/${framework.name}/${item}/item.json`;
      requirements[file] = (await readJson(join(root, file))).requires ?? {};
    }
  }
  return requirements;
}

export async function readReleaseModel(root) {
  for (const platform of ["node", "cloudflare"])
    await platformReleaseVersion(join(root, "packages", `platform-${platform}`), { check: true });
  const definition = await readJson(join(root, "release/alpha.json"));
  const manifests = {};
  for (const area of ["packages", "apps"]) {
    for (const entry of await readdir(join(root, area), { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const manifest = await readJson(join(root, area, entry.name, "package.json"));
      manifests[manifest.name] = { manifest, directory: `${area}/${entry.name}` };
    }
  }
  return {
    definition,
    manifests,
    rootManifest: await readJson(join(root, "package.json")),
    templates: await Promise.all(
      ["package.json", "site/package.json"].map((file) =>
        readJson(join(root, "packages/create-lace/templates", file)),
      ),
    ),
    templateVersion: (
      await readFile(join(root, "packages/create-lace/src/inventory.ts"), "utf8")
    ).match(/TEMPLATE_VERSION = "([^"]+)"/u)?.[1],
    environment: await readFile(join(root, "packages/create-lace/templates/.env.example"), "utf8"),
    guides: Object.fromEntries(
      await Promise.all(
        RELEASE_GUIDES.map(async (file) => [file, await readFile(join(root, file), "utf8")]),
      ),
    ),
    registry: await readRegistryRequirements(root),
    dockerfiles: Object.fromEntries(
      await Promise.all(
        RELEASE_DOCKERFILES.map(async (file) => [file, await readFile(join(root, file), "utf8")]),
      ),
    ),
  };
}

export function validateReleaseModel(model, { templates = true } = {}) {
  const { definition: release, manifests } = model;
  if (
    release.schemaVersion !== 1 ||
    !/^\d+\.\d+\.\d+-alpha\.\d+$/u.test(release.version) ||
    release.generatorVersion !== release.version ||
    release.channel !== "next" ||
    !/^\d+\.\d+\.\d+$/u.test(release.templateVersion) ||
    release.images.api !== "ghcr.io/lacecms/api" ||
    release.images.builder !== "ghcr.io/lacecms/builder" ||
    JSON.stringify(release.platforms) !== JSON.stringify(["linux/amd64", "linux/arm64"])
  )
    throw new Error("Invalid alpha release coordinates/version/platforms");
  if (
    !Array.isArray(release.publishedVersions) ||
    release.publishedVersions.some((version) => !/^\d+\.\d+\.\d+-alpha\.\d+$/u.test(version))
  )
    throw new Error("Invalid published version record");
  if (release.publishedVersions.includes(release.version))
    throw new Error(
      `Release version ${release.version} is already published; select a new prerelease version`,
    );
  const publicNames = new Set(release.packages.map(packageName));
  if (publicNames.size !== 15 || publicNames.has("@lacecms/test-utils"))
    throw new Error("Invalid public package allowlist");
  if (!model.rootManifest.private) throw new Error("Workspace root must remain private");
  const engineManifests = [["workspace root", model.rootManifest]];
  if (templates) engineManifests.push(["generated CMS template", model.templates[0]]);
  for (const [label, manifest] of engineManifests) {
    if (
      manifest.engines?.node !== ENGINE_MINIMUMS.node ||
      manifest.engines?.pnpm !== ENGINE_MINIMUMS.pnpm
    )
      throw new Error(`Engine minimum mismatch: ${label}`);
  }
  for (const [name, { manifest }] of Object.entries(manifests)) {
    if (!publicNames.has(name) && !manifest.private)
      throw new Error(`Non-release package must remain private: ${name}`);
  }
  const order = [];
  const visiting = new Set();
  const visited = new Set();
  function visit(name) {
    if (visited.has(name)) return;
    if (visiting.has(name)) throw new Error(`Circular release dependency: ${name}`);
    const manifest = manifests[name]?.manifest;
    if (!manifest || manifest.private || !publicNames.has(name))
      throw new Error(`Missing/private release dependency: ${name}`);
    if (manifest.version !== release.version || manifest.publishConfig?.access !== "public")
      throw new Error(`Release version/access mismatch: ${name}`);
    if (
      manifest.engines?.node !== ENGINE_MINIMUMS.node ||
      (manifest.engines.pnpm !== undefined && manifest.engines.pnpm !== ENGINE_MINIMUMS.pnpm)
    )
      throw new Error(`Release Node requirement mismatch: ${name}`);
    visiting.add(name);
    for (const [dependency, reference] of Object.entries({
      ...manifest.dependencies,
      ...manifest.optionalDependencies,
      ...manifest.peerDependencies,
    })) {
      if (dependency.startsWith("@lacecms/")) {
        if (reference !== "workspace:*" && reference !== release.version)
          throw new Error(`Release dependency version mismatch: ${name} -> ${dependency}`);
        visit(dependency);
      } else if (/^(?:file:|link:|workspace:|https?:|git)/u.test(reference)) {
        throw new Error(`Non-registry release dependency: ${name} -> ${dependency}`);
      }
    }
    visiting.delete(name);
    visited.add(name);
    order.push(name);
  }
  for (const name of publicNames) visit(name);
  // Derive the consumer closure as well as checking the allowlist itself.
  for (const template of model.templates) {
    for (const [name, reference] of Object.entries(template.dependencies ?? {})) {
      if (!name.startsWith("@lacecms/")) continue;
      visit(name);
      if (templates && reference !== release.version)
        throw new Error(`Template dependency version mismatch: ${name}`);
    }
  }
  if (templates) {
    if (model.templateVersion !== release.templateVersion)
      throw new Error("Template identity mismatch");
    for (const [kind, coordinate] of Object.entries(release.images)) {
      if (
        !model.environment.includes(
          `LACE_${kind.toUpperCase()}_IMAGE=${coordinate}:${release.version}\n`,
        )
      )
        throw new Error(`Template image mismatch: ${kind}`);
    }
    for (const [file, text] of Object.entries(model.dockerfiles ?? {})) {
      if (!text.includes(`ARG LACE_VERSION=${release.version}\n`))
        throw new Error(`Runtime image version default mismatch: ${file}`);
    }
    for (const [file, requires] of Object.entries(model.registry ?? {})) {
      for (const [name, range] of Object.entries(requires)) {
        if (name.startsWith("@lacecms/") && range !== release.version)
          throw new Error(`Registry package requirement mismatch: ${file} -> ${name}`);
      }
    }
    for (const [file, text] of Object.entries(model.guides ?? {})) {
      for (const match of text.matchAll(COORDINATE)) {
        if (match[1] !== release.version)
          throw new Error(`Stale release coordinate in ${file}: ${match[0]}`);
      }
    }
  }
  return order;
}

export function validatePackedManifest(manifest, release) {
  if (manifest.private || manifest.version !== release.version)
    throw new Error(`Invalid packed version/access: ${manifest.name}`);
  if (manifest.devDependencies)
    throw new Error(`Development metadata in archive: ${manifest.name}`);
  for (const section of ["dependencies", "optionalDependencies", "peerDependencies"]) {
    for (const [name, reference] of Object.entries(manifest[section] ?? {})) {
      if (
        typeof reference !== "string" ||
        /(?:workspace:|catalog:|file:|link:|https?:|git|\.\.\/)/u.test(reference) ||
        (name.startsWith("@lacecms/") &&
          (reference !== release.version || !release.packages.map(packageName).includes(name)))
      )
        throw new Error(`Invalid packed dependency: ${manifest.name} -> ${name}`);
    }
  }
}
