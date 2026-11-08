import type {
  ConfigurationSyncModel,
  StoredContentModelState,
  ConfigurationSyncEvolution,
  ConfigurationSyncOperation,
  StructuralChange,
  ConfigurationSyncChange,
} from "./types.js";

export function incompatible(
  model: ConfigurationSyncModel,
  stored: StoredContentModelState,
  evolution?: ConfigurationSyncEvolution,
): ConfigurationSyncOperation {
  return Object.freeze({
    action: "incompatible-change",
    ...(evolution === undefined ? {} : { evolution }),
    model,
    stored,
  });
}

export function undecidedChange(change: StructuralChange): ConfigurationSyncChange {
  return Object.freeze({
    class: change.class,
    ...(change.from === undefined ? {} : { from: change.from }),
    ...(change.hinted === undefined ? {} : { hinted: change.hinted }),
    kind: change.kind,
    ...(change.properties === undefined ? {} : { properties: change.properties }),
    scope: change.scope,
    target: change.target,
    ...(change.scope === "field" && change.target.startsWith("/")
      ? { schemaPath: change.target }
      : {}),
  });
}
