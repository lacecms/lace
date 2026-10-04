import { expect, test } from "vitest";
import {
  readReleaseModel,
  validatePackedManifest,
  validateReleaseModel,
} from "../scripts/release-model.mjs";

async function coherentModel() {
  const model = await readReleaseModel(new URL("..", import.meta.url).pathname);
  for (const directory of model.definition.packages) {
    const name = directory === "create-lace" ? directory : `@lacecms/${directory}`;
    Object.assign(model.manifests[name].manifest, {
      version: model.definition.version,
      private: false,
      publishConfig: { access: "public" },
      engines: { node: ">=24.12.0 <25" },
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
  return model;
}

test("release closes over fourteen artifacts in dependency order", async () => {
  const model = await coherentModel();
  const order = validateReleaseModel(model);
  expect(order).toHaveLength(14);
  expect(order.indexOf("@lacecms/content")).toBeLessThan(order.indexOf("@lacecms/config"));
  expect(order.indexOf("@lacecms/config")).toBeLessThan(order.indexOf("@lacecms/cli"));
  expect(order.indexOf("@lacecms/content")).toBeLessThan(order.indexOf("@lacecms/render"));
});

test.each(["version", "private", "missing", "cycle", "template", "image", "internal"])(
  "rejects %s release graph drift",
  async (failure) => {
    const model = await coherentModel();
    const manifest = model.manifests["@lacecms/content"].manifest;
    if (failure === "version") manifest.version = "0.0.0";
    if (failure === "private") manifest.private = true;
    if (failure === "missing") delete model.manifests["@lacecms/content"];
    if (failure === "cycle") manifest.dependencies["@lacecms/config"] = "workspace:*";
    if (failure === "template") model.templateVersion = "0.0.0";
    if (failure === "image") model.environment = "";
    if (failure === "internal") manifest.dependencies["@lacecms/test-utils"] = "workspace:*";
    expect(() => validateReleaseModel(model)).toThrow();
  },
);

test("packed metadata rejects workspace/catalog/local/private dependencies", async () => {
  const { definition } = await coherentModel();
  for (const reference of ["workspace:*", "catalog:", "file:x.tgz", "link:../src", "0.0.0"]) {
    expect(() =>
      validatePackedManifest(
        {
          name: "@lacecms/config",
          version: definition.version,
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
        dependencies: { "@lacecms/content": definition.version },
      },
      definition,
    ),
  ).not.toThrow();
});
