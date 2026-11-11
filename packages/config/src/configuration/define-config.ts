import { deepFreeze, isPlainObject } from "@lacecms/content";
import {
  defineBlockRegistry,
  sha256CanonicalJson,
  toBlockRegistryMetadata,
} from "@lacecms/content";
import type { BlockRegistry, JsonObject, JsonValue } from "@lacecms/content";
import type {
  NormalizedRoutableModel,
  PageModelDefinition,
  CollectionModelDefinition,
  GlobalModelDefinition,
  ContentModelDefinition,
  NormalizedContentModel,
  LaceConfigInput,
  PublicConfigProjection,
  NormalizedConfig,
} from "../models/types.js";
import { fail } from "../shared/errors.js";
import { pageMatchesCollection } from "../models/routes.js";
import {
  omitDisplayMetadata,
  omitListFields,
  withoutDisplayProperties,
  fieldMapWithoutPlaceholders,
  fieldMapStructure,
  blockWithoutVisibility,
  contentModelStructure,
} from "../structure/canonical.js";
import { modelForHash, normalizedModelForHash } from "../structure/hash-input.js";

function assertUniqueModels(models: readonly ContentModelDefinition[]): void {
  const currentKeys = new Map<string, ContentModelDefinition>();
  const formerKeys = new Map<string, ContentModelDefinition>();
  const pagePaths = new Map<string, PageModelDefinition>();
  const collectionRoutes = new Map<
    string,
    CollectionModelDefinition & { readonly route: string }
  >();
  let seoDefaultsGlobal: GlobalModelDefinition | undefined;

  for (const model of models) {
    const duplicateCurrent = currentKeys.get(model.key);
    if (duplicateCurrent !== undefined) {
      fail(`models "${duplicateCurrent.key}" and "${model.key}" share key "${model.key}".`);
    }
    if (formerKeys.has(model.key)) {
      fail(`model key "${model.key}" duplicates a renamedFrom key.`);
    }
    currentKeys.set(model.key, model);

    if (model.renamedFrom !== undefined) {
      if (currentKeys.has(model.renamedFrom)) {
        fail(`renamedFrom "${model.renamedFrom}" duplicates a model key.`);
      }
      const duplicateFormer = formerKeys.get(model.renamedFrom);
      if (duplicateFormer !== undefined) {
        fail(
          `models "${duplicateFormer.key}" and "${model.key}" share renamedFrom "${model.renamedFrom}".`,
        );
      }
      formerKeys.set(model.renamedFrom, model);
    }

    switch (model.kind) {
      case "page": {
        const duplicatePath = pagePaths.get(model.path);
        if (duplicatePath !== undefined) {
          fail(`pages "${duplicatePath.key}" and "${model.key}" share path "${model.path}".`);
        }
        pagePaths.set(model.path, model);
        break;
      }
      case "collection": {
        if (model.route === undefined) break;
        const duplicateRoute = collectionRoutes.get(model.route);
        if (duplicateRoute !== undefined) {
          fail(
            `collections "${duplicateRoute.key}" and "${model.key}" share route "${model.route}".`,
          );
        }
        collectionRoutes.set(model.route, { ...model, route: model.route });
        break;
      }
      case "global":
        if (model.seoDefaults !== undefined) {
          if (seoDefaultsGlobal !== undefined) {
            fail(
              `globals "${seoDefaultsGlobal.key}" and "${model.key}" both declare seoDefaults; at most one global may.`,
            );
          }
          seoDefaultsGlobal = model;
        }
        break;
      default:
        model satisfies never;
    }
  }

  for (const page of pagePaths.values()) {
    for (const collection of collectionRoutes.values()) {
      if (pageMatchesCollection(page.path, collection.route)) {
        fail(
          `page "${page.key}" path "${page.path}" collides with collection "${collection.key}".`,
        );
      }
    }
  }
}

function assertRegisteredModelBlocks(
  models: readonly ContentModelDefinition[],
  registry: BlockRegistry,
): void {
  for (const model of models) {
    for (const type of model.blocks) {
      if (registry.get(type) === undefined) {
        fail(`model "${model.key}" references unregistered block type "${type}".`);
      }
    }
  }
}

function publicModel(model: NormalizedContentModel): NormalizedContentModel {
  const {
    publicProjectionHash: _publicProjectionHash,
    removedBlocks: _removedBlocks,
    removedFields: _removedFields,
    removedSeo: _removedSeo,
    renamedFields: _renamedFields,
    renamedFrom: _renamedFrom,
    structure: _structure,
    ...projection
  } = model as NormalizedContentModel & NormalizedRoutableModel;
  return deepFreeze(projection) as NormalizedContentModel;
}

/**
 * Normalizes models and produces hashes with the same asynchronous Web Crypto
 * implementation in Node and Cloudflare Workers. Callers can use top-level
 * `await` when exporting `lace.config.ts`.
 */
export async function defineConfig<const Models extends readonly ContentModelDefinition[]>(
  input: LaceConfigInput<Models>,
): Promise<NormalizedConfig<Models>> {
  if (
    input === null ||
    typeof input !== "object" ||
    Array.isArray(input) ||
    !isPlainObject(input)
  ) {
    fail("config must be a plain object.");
  }
  if (!Array.isArray(input.content)) {
    fail("config.content must be an array of models.");
  }

  const registry = defineBlockRegistry(input.blocks ?? []);
  const models = [...input.content];
  assertUniqueModels(models);
  assertRegisteredModelBlocks(models, registry);
  models.sort((left, right) => left.key.localeCompare(right.key));

  const normalizedModels = await Promise.all(
    models.map(async (model) => {
      const projection = modelForHash(model, registry);
      const { listOptions: _listOptions, ...publicIdentity } = projection as JsonObject;
      const structure = contentModelStructure(model, registry);
      const structureHash = await sha256CanonicalJson(structure);
      const normalized: NormalizedContentModel = {
        ...model,
        publicProjectionHash: await sha256CanonicalJson(publicIdentity),
        projectionHash: await sha256CanonicalJson(projection),
        structure,
        structureHash,
      };
      return deepFreeze(normalized);
    }),
  );

  const blocks = toBlockRegistryMetadata(registry);
  const publicModels = normalizedModels.map(publicModel);
  const hashModels = publicModels.map(normalizedModelForHash);
  const projection = { blocks, content: hashModels } as unknown as JsonValue;
  const structure = {
    blocks,
    content: hashModels.map(omitListFields),
  } as unknown as JsonValue;
  // Preserve scalar-only global hashes; composite identity visits descriptor positions
  // so content/default keys named label or description remain structural.
  const publicProjection: PublicConfigProjection = {
    blocks,
    content: deepFreeze(publicModels),
    projectionHash: await sha256CanonicalJson(projection),
    structureHash: await sha256CanonicalJson(
      [...blocks, ...publicModels].some((definition) =>
        Object.values(definition.fields).some(
          (field) => field.type === "group" || field.type === "list",
        ),
      )
        ? {
            blocks: blocks.map((block) => ({
              ...blockWithoutVisibility(block as unknown as JsonValue),
              fields: fieldMapStructure(block.fields as unknown as JsonValue),
              ...(block.settings === undefined
                ? {}
                : { settings: fieldMapStructure(block.settings as unknown as JsonValue) }),
            })),
            content: hashModels.map((model) => ({
              ...withoutDisplayProperties(omitListFields(model)),
              fields: fieldMapStructure((model as JsonObject).fields),
            })),
          }
        : omitDisplayMetadata({
            ...(structure as JsonObject),
            blocks: blocks.map((block) => ({
              ...blockWithoutVisibility(block as unknown as JsonValue),
              fields: fieldMapWithoutPlaceholders(block.fields as unknown as JsonValue),
              ...(block.settings === undefined
                ? {}
                : {
                    settings: fieldMapWithoutPlaceholders(block.settings as unknown as JsonValue),
                  }),
            })),
            content: hashModels.map((model) => ({
              ...(omitListFields(model) as JsonObject),
              fields: fieldMapWithoutPlaceholders((model as JsonObject).fields),
            })),
          } as unknown as JsonValue),
    ),
  };
  const normalized: NormalizedConfig<Models> = {
    ...publicProjection,
    public: deepFreeze({ ...publicProjection }),
    runtime: deepFreeze({ blocks: registry, content: deepFreeze(normalizedModels) }),
  };
  return deepFreeze(normalized);
}
