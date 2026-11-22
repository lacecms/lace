import type { BlockRegistry, FieldDefinition, ModelFieldDefinitions } from "@lacecms/content";
import type { ContentModelDefinition } from "../models/types.js";
import { fail } from "../shared/errors.js";

/** Resolve references after all normalized models and blocks are registered. */
export function assertReferenceTargetModels(
  models: readonly ContentModelDefinition[],
  registry: BlockRegistry,
): void {
  const byKey = new Map(models.map((model) => [model.key, model]));
  function visit(definition: FieldDefinition, path: string): void {
    if (definition.type === "group") {
      visitFields(definition.fields, path);
    } else if (definition.type === "list") {
      visit(definition.item, `${path}/*`);
    } else if (definition.type === "reference") {
      for (const key of definition.models) {
        const model = byKey.get(key);
        if (model === undefined) fail(`${path} references unknown model "${key}".`);
        if (model.kind === "global") fail(`${path} references global model "${key}".`);
      }
    }
  }
  function visitFields(fields: ModelFieldDefinitions, path: string): void {
    for (const [key, definition] of Object.entries(fields)) visit(definition, `${path}/${key}`);
  }
  for (const model of models) visitFields(model.fields, `model "${model.key}" fields`);
  for (const block of registry.blocks) visitFields(block.fields, `block "${block.type}" fields`);
}
