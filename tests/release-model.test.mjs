import { expect, test } from "vitest";
import {
  readReleaseModel,
  validatePackedManifest,
  validateReleaseModel,
} from "../scripts/release-model.mjs";

const repositoryRoot = new URL("..", import.meta.url).pathname;

async function coherentModel(version) {
  const model = await readReleaseModel(repositoryRoot);
  if (version) {
    model.definition.version = model.definition.generatorVersion = version;
    model.definition.channel = version.includes("-") ? "next" : "latest";
  }
  // The repository can sit between a recorded publication and the next
  // candidate selection; graph checks treat its coordinates as a candidate.
  model.definition.publishedVersions = model.definition.publishedVersions.filter(
    (version) => version !== model.definition.version,
  );
  for (const directory of model.definition.packages) {
    const name = directory === "create-lace" ? directory : `@lacecms/${directory}`;
    Object.assign(model.manifests[name].manifest, {
      version: model.definition.version,
      private: false,
      publishConfig: { access: "public", tag: model.definition.channel },
      engines: { node: ">=24.12.0" },
    });
  }
  for (const template of model.templates)
    for (const name of Object.keys(template.dependencies))
      if (name.startsWith("@lacecms/")) template.dependencies[name] = model.definition.version;
  model.templateVersion = model.definition.templateVersion;
  model.environment = Object.entries(model.definition.images)
    .map(
      ([kind, coordinate]) =>
        `LACE_${kind.toUpperCase()}_IMAGE=${coordinate}:${model.definition.version}\n`,
    )
    .join("");
  for (const requires of Object.values(model.registry))
    for (const name of Object.keys(requires)) requires[name] = model.definition.version;
  for (const file of Object.keys(model.dockerfiles))
    model.dockerfiles[file] = model.dockerfiles[file].replace(
      /^ARG LACE_VERSION=.*$/mu,
      `ARG LACE_VERSION=${model.definition.version}`,
    );
  for (const file of Object.keys(model.guides))
    model.guides[file] =
      `pnpm create lace@${model.definition.version} my-site\n` +
      `Published \`0.1.0-alpha.1\` artifacts predate browser setup.\n`;
  return model;
}

test("release closes over the complete artifact inventory in dependency order", async () => {
  const model = await coherentModel();
  const order = validateReleaseModel(model);
  expect(order).toHaveLength(model.definition.packages.length);
  expect(order).toContain("@lacecms/mcp");
  expect(order.indexOf("@lacecms/content")).toBeLessThan(order.indexOf("@lacecms/config"));
  expect(order.indexOf("@lacecms/config")).toBeLessThan(order.indexOf("@lacecms/cli"));
  expect(order.indexOf("@lacecms/content")).toBeLessThan(order.indexOf("@lacecms/render"));
  expect(order.indexOf("@lacecms/render")).toBeLessThan(order.indexOf("@lacecms/astro"));
  expect(order.indexOf("@lacecms/sdk")).toBeLessThan(order.indexOf("@lacecms/astro"));
});

test("the coherent model accepts historical prose about published versions", async () => {
  const model = await coherentModel();
  expect(model.definition.publishedVersions).toContain("0.1.0-alpha.1");
  expect(model.definition.publishedVersions).not.toContain(model.definition.version);
  expect(() => validateReleaseModel(model)).not.toThrow();
});

test("published versions are recorded and cannot be prepared again", async () => {
  const { definition } = await readReleaseModel(repositoryRoot);
  expect(definition.publishedVersions).toEqual([
    "0.1.0-alpha.1",
    "0.1.0-alpha.2",
    "0.1.0-alpha.3",
    "0.1.0-alpha.4",
    "0.1.0-alpha.5",
    "0.1.0-alpha.6",
    "0.1.0-alpha.7",
    "0.1.0-alpha.8",
    "0.1.0-rc1",
    "0.1.0-rc2",
    "0.1.0-rc3",
    "0.1.0-rc4",
    "0.1.0-rc5",
    "1.0.0",
  ]);
  for (const version of [
    "0.1.0-alpha.2",
    "0.1.0-alpha.4",
    "0.1.0-alpha.5",
    "0.1.0-alpha.6",
    "0.1.0-alpha.7",
    "0.1.0-alpha.8",
    "0.1.0-rc1",
    "0.1.0-rc2",
    "0.1.0-rc3",
    "0.1.0-rc4",
    "0.1.0-rc5",
    "1.0.0",
  ]) {
    const model = await coherentModel();
    model.definition.publishedVersions = definition.publishedVersions;
    model.definition.version = model.definition.generatorVersion = version;
    model.definition.channel = version.includes("-") ? "next" : "latest";
    expect(() => validateReleaseModel(model)).toThrow(`${version} is already published`);
  }
});

test.each([
  "version",
  "private",
  "missing",
  "cycle",
  "template",
  "image",
  "internal",
  "published",
  "published-record",
  "dockerfile",
  "guide-create",
  "guide-package",
  "guide-image",
  "registry",
  "engine-package",
  "engine-template",
  "engine-root",
  "package-manager-range",
  "dev-engines-range",
])("rejects %s release graph drift", async (failure) => {
  const model = await coherentModel();
  const manifest = model.manifests["@lacecms/content"].manifest;
  if (failure === "version") manifest.version = "0.0.0";
  if (failure === "private") manifest.private = true;
  if (failure === "missing") delete model.manifests["@lacecms/content"];
  if (failure === "cycle") manifest.dependencies["@lacecms/config"] = "workspace:*";
  if (failure === "template") model.templateVersion = "0.0.0";
  if (failure === "image") model.environment = "";
  if (failure === "internal") manifest.dependencies["@lacecms/test-utils"] = "workspace:*";
  if (failure === "published")
    model.definition.publishedVersions = [
      ...model.definition.publishedVersions,
      model.definition.version,
    ];
  if (failure === "published-record") delete model.definition.publishedVersions;
  if (failure === "dockerfile")
    model.dockerfiles["apps/builder/Dockerfile"] = "ARG LACE_VERSION=0.1.0-alpha.1\n";
  if (failure === "registry")
    model.registry["registry/astro/quote/item.json"]["@lacecms/astro"] = "0.1.0-alpha.1";
  if (failure === "engine-package") manifest.engines = { node: ">=24.12.0 <25" };
  if (failure === "engine-template") model.templates[0].engines.pnpm = ">=12 <13";
  if (failure === "engine-root") model.rootManifest.engines.node = ">=24.12.0 <25";
  if (failure === "package-manager-range") model.templates[0].packageManager = "pnpm@>=12";
  if (failure === "dev-engines-range")
    model.templates[0].devEngines = { packageManager: { name: "pnpm", version: ">=12" } };
  const guide = "packages/create-lace/templates/docs/lace-operations.md";
  if (failure === "guide-create") model.guides[guide] += "pnpm create lace@0.1.0-alpha.1 x\n";
  if (failure === "guide-package") model.guides[guide] += "pnpm add @lacecms/astro@0.1.0-alpha.1\n";
  if (failure === "guide-image") model.guides[guide] += "ghcr.io/lacecms/api:0.1.0-alpha.1\n";
  expect(() => validateReleaseModel(model)).toThrow();
});

test.each([
  ["apps/api/Dockerfile", /pnpm@\S+(?=\n)/u, "pnpm@12"],
  ["apps/builder/Dockerfile", /pnpm@\S+(?=\n)/u, "pnpm@12"],
  ["apps/builder/Dockerfile", /pnpm@\S+(?= \\\n)/u, "pnpm@12.3.4"],
])("rejects pnpm version drift in %s", async (file, pin, replacement) => {
  const model = await coherentModel();
  model.dockerfiles[file] = model.dockerfiles[file].replace(pin, replacement);
  expect(() => validateReleaseModel(model)).toThrow(
    `Release image must install ${model.rootManifest.packageManager}: ${file}`,
  );
});

test("scenario guides are registered release guides with candidate coordinates", async () => {
  const model = await readReleaseModel(repositoryRoot);
  for (const guide of ["lace-compose-dev.md", "lace-compose-production.md", "lace-cloudflare.md"])
    expect(Object.keys(model.guides)).toContain(`packages/create-lace/templates/docs/${guide}`);
  const model2 = await coherentModel();
  model2.guides["packages/create-lace/templates/docs/lace-cloudflare.md"] +=
    "pnpm add @lacecms/cli@0.1.0-alpha.1\n";
  expect(() => validateReleaseModel(model2)).toThrow("lace-cloudflare.md");
});

test("packed metadata rejects workspace/catalog/local/private dependencies", async () => {
  const { definition } = await coherentModel();
  expect(() =>
    validatePackedManifest(
      { name: "create-lace", version: definition.version, publishConfig: { tag: "invalid" } },
      definition,
    ),
  ).toThrow("packed channel");
  for (const reference of ["workspace:*", "catalog:", "file:x.tgz", "link:../src", "0.0.0"]) {
    expect(() =>
      validatePackedManifest(
        {
          name: "@lacecms/config",
          version: definition.version,
          publishConfig: { tag: definition.channel },
          dependencies: { "@lacecms/content": reference },
        },
        definition,
      ),
    ).toThrow();
  }
  expect(() =>
    validatePackedManifest(
      {
        name: "@lacecms/config",
        version: definition.version,
        publishConfig: { tag: definition.channel },
        dependencies: { "@lacecms/content": definition.version },
      },
      definition,
    ),
  ).not.toThrow();
});

test("published alpha.3 is immutable after the Cross-runtime candidate refresh", async () => {
  const model = await coherentModel();
  model.definition.version = model.definition.generatorVersion = "0.1.0-alpha.3";
  model.definition.channel = "next";
  expect(() => validateReleaseModel(model)).toThrow(/already published/u);
});

test.each(["0.1.0-alpha.8", "0.1.0-rc1", "0.1.0-rc12"])(
  "accepts coherent prerelease %s without renaming",
  async (version) => {
    const model = await coherentModel(version);
    expect(validateReleaseModel(model)).toHaveLength(16);
    expect(model.definition.version).toBe(version);
    expect(model.definition.channel).toBe("next");
    if (version.includes("rc")) {
      model.definition.publishedVersions.push(version);
      expect(() => validateReleaseModel(model)).toThrow(`${version} is already published`);
    }
  },
);

test.each([
  "01.1.0",
  "0.1.0-rc.1",
  "0.1.0-rc0",
  "0.1.0-rc01",
  "0.1.0-alpha.0",
  "0.1.0-rc1+build",
  "rc1",
])("rejects invalid candidate and history version %s", async (version) => {
  const candidate = await coherentModel(version);
  expect(() => validateReleaseModel(candidate)).toThrow("Invalid release");
  const history = await coherentModel();
  history.definition.publishedVersions.push(version);
  expect(() => validateReleaseModel(history)).toThrow("Invalid published version");
});

test("stable and prerelease versions require their selected distribution channel", async () => {
  for (const version of ["1.0.0", "1.1.0-rc1"]) {
    const model = await coherentModel(version);
    expect(validateReleaseModel(model)).toHaveLength(16);
    model.definition.channel = model.definition.channel === "latest" ? "next" : "latest";
    expect(() => validateReleaseModel(model)).toThrow("Invalid release coordinates");
  }
});
