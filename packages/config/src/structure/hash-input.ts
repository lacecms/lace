import { toBlockMetadata } from "@lacecms/content";
import type { BlockRegistry, JsonValue } from "@lacecms/content";
import type {
  NormalizedRoutableModel,
  ContentModelDefinition,
  NormalizedContentModel,
} from "../models/types.js";

export type MutableJsonObject = { [key: string]: MutableJsonValue };

export type MutableJsonValue =
  | boolean
  | null
  | number
  | string
  | MutableJsonObject
  | MutableJsonValue[];

function asJsonValue(value: unknown): JsonValue {
  return value as JsonValue;
}

export function modelForHash(model: ContentModelDefinition, registry: BlockRegistry): JsonValue {
  const {
    legacyStructureHash: _legacyStructureHash,
    projectionHash: _projectionHash,
    publicProjectionHash: _publicProjectionHash,
    removedBlocks: _removedBlocks,
    removedFields: _removedFields,
    removedSeo: _removedSeo,
    renamedFields: _renamedFields,
    renamedFrom: _renamedFrom,
    structure: _structure,
    structureHash: _structureHash,
    ...identityModel
  } = model as NormalizedContentModel & NormalizedRoutableModel;
  return asJsonValue({
    ...identityModel,
    blockDefinitions: model.blocks.map((type) => toBlockMetadata(registry.get(type)!)),
  });
}

export function normalizedModelForHash(model: NormalizedContentModel): JsonValue {
  const {
    legacyStructureHash: _legacyStructureHash,
    projectionHash: _projectionHash,
    publicProjectionHash: _publicProjectionHash,
    removedBlocks: _removedBlocks,
    removedFields: _removedFields,
    removedSeo: _removedSeo,
    renamedFields: _renamedFields,
    renamedFrom: _renamedFrom,
    structure: _structure,
    structureHash: _structureHash,
    ...serializableModel
  } = model as NormalizedContentModel & NormalizedRoutableModel;
  return asJsonValue(serializableModel);
}
