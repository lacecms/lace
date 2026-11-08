import { deepFreeze } from "../shared/objects.js";
import type { BlockDefinition, BlockMetadata, BlockRegistry } from "./types.js";
import { toBlockMetadata } from "./definition.js";
import { blockFail } from "./errors.js";

/** Creates a registry and rejects duplicate current block types. */
export function defineBlockRegistry(blocks: readonly BlockDefinition[]): BlockRegistry {
  if (!Array.isArray(blocks)) {
    blockFail("blocks must be an array of block definitions.");
  }
  const definitions = new Map<string, BlockDefinition>();
  for (const definition of blocks) {
    if (definitions.has(definition.type)) {
      blockFail(`blocks contains duplicate block type "${definition.type}".`);
    }
    definitions.set(definition.type, definition);
  }
  const normalized = deepFreeze([...definitions.values()]);
  return Object.freeze({ blocks: normalized, get: (type: string) => definitions.get(type) });
}

/** Projects a registry to immutable JSON-safe metadata for admin and public clients. */
export function toBlockRegistryMetadata(registry: BlockRegistry): readonly BlockMetadata[] {
  return deepFreeze(registry.blocks.map(toBlockMetadata));
}
