import { satisfies } from "semver";
import { decideManagedFile } from "./managed-decision.js";
import type { ManagedAction } from "./managed-decision.js";
import { BlockError, dependencyClosure, frameworkItems } from "./blocks-registry.js";
import type { Registry, RegistryItem } from "./blocks-registry.js";
import {
  customComponentFile,
  missingMapLines,
  renderBlockMap,
  renderCustomScaffold,
} from "./blocks-map.js";
import type { MapEntry, ScaffoldField } from "./blocks-map.js";
import {
  DEFAULT_BLOCK_MAP,
  DEFAULT_COMPONENTS_DIR,
  LOCK_FILE,
  findDefinitionExport,
  installedVersion,
  readSiteFile,
  serializeLock,
} from "./blocks-site.js";
import type {
  ConfiguredBlock,
  LockCustomBlock,
  LockItem,
  SelectedSite,
  SiteLock,
} from "./blocks-site.js";
import { upgradeHash } from "./upgrade-input.js";
import { unifiedUpgradeDiff } from "./upgrade.js";

export type ItemStatus = "added" | "updated" | "current" | "conflict" | "blocked" | "scaffolded";

export interface FileDecision {
  readonly path: string;
  readonly item: string;
  readonly action: ManagedAction;
  readonly reason: string;
  readonly recordedHash: string | null;
  readonly currentHash: string | null;
  readonly targetHash: string | null;
  readonly diff: string | null;
  /** Bytes to install; absent for removals and untouched files. */
  readonly bytes?: Buffer;
  /** Proposed bytes, also kept for conflicts so `--write-new` can offer them. */
  readonly targetBytes?: Buffer;
}

export interface ItemOutcome {
  readonly name: string;
  readonly blockType: string;
  readonly kind: "registry" | "custom";
  readonly revision: number | null;
  readonly status: ItemStatus;
  readonly reason?: string;
}

export interface BlockPlan {
  readonly schemaVersion: 1;
  readonly site: string;
  readonly framework: string;
  readonly configChecked: boolean;
  readonly items: readonly ItemOutcome[];
  readonly files: readonly FileDecision[];
  readonly blockMap: FileDecision & { readonly entriesToAdd: readonly string[] };
  readonly lock: {
    readonly path: string;
    readonly action: "add" | "replace" | "current";
    readonly bytes: Buffer;
    readonly currentHash: string | null;
  };
  readonly packages: {
    readonly missing: readonly { name: string; range: string; installed: string | null }[];
    readonly command: string | null;
  };
  readonly versionMismatches: readonly {
    blockType: string;
    registryVersion: number;
    configVersion: number;
  }[];
  readonly missingRenderers: readonly { blockType: string; reason: string }[];
  readonly conflicts: number;
  readonly changes: number;
}

const changing = (action: ManagedAction): boolean => ["add", "replace", "remove"].includes(action);
const hashOf = (bytes: Buffer | undefined): string | null =>
  bytes === undefined ? null : upgradeHash(bytes);

function decide(
  path: string,
  item: string,
  recorded: string | null,
  tracked: boolean,
  current: Buffer | undefined,
  target: Buffer | undefined,
): FileDecision {
  const currentHash = hashOf(current);
  const targetHash = hashOf(target);
  let { action, reason } = decideManagedFile({
    tracked,
    baselineHash: recorded,
    currentHash,
    targetHash,
  });
  // Block-specific adjustments: adopt identical untracked bytes (interrupted runs converge)
  // and restore a recorded file the operator deleted, because the block was requested again.
  if (!tracked && currentHash !== null && currentHash === targetHash) {
    action = "current";
    reason = "matches-target";
  } else if (tracked && currentHash === null && targetHash !== null) {
    action = "add";
    reason = "restored-missing-file";
  }
  return {
    path,
    item,
    action,
    reason,
    recordedHash: recorded,
    currentHash,
    targetHash,
    diff:
      changing(action) || action === "conflict" ? unifiedUpgradeDiff(path, current, target) : null,
    ...(target !== undefined && changing(action) ? { bytes: target } : {}),
    ...(target === undefined ? {} : { targetBytes: target }),
  };
}

function shellWord(value: string): string {
  return /^[\w@./:=+-]+$/u.test(value) ? value : `'${value.replaceAll("'", "'\\''")}'`;
}

export async function planBlocks(options: {
  readonly site: SelectedSite;
  readonly registry: Registry;
  readonly types: readonly string[];
  readonly all: boolean;
  readonly configured: readonly ConfiguredBlock[] | null;
}): Promise<BlockPlan> {
  const { site, registry, configured } = options;
  const lock0: SiteLock = site.lock ?? {
    schemaVersion: 1,
    framework: site.framework,
    componentsDir: DEFAULT_COMPONENTS_DIR,
    blockMap: DEFAULT_BLOCK_MAP,
    blockMapSha256: null,
    items: {},
  };
  const available = frameworkItems(registry, site.framework);
  const byType = new Map(available.map((item) => [item.blockType, item]));
  const configuredTypes = new Map((configured ?? []).map((block) => [block.type, block.version]));

  // Selection.
  const selectedNames: string[] = [];
  const customTypes: string[] = [];
  if (options.all) {
    if (configured === null)
      throw new BlockError(
        "BLOCK_CONFIG",
        "--all installs the block types registered in lace.config.ts; run it from the CMS project root that contains lace.config.ts.",
      );
    for (const block of configured) {
      const item = byType.get(block.type);
      if (item !== undefined) selectedNames.push(item.name);
      else customTypes.push(block.type);
    }
  } else {
    for (const type of new Set(options.types)) {
      const item = byType.get(type);
      if (item !== undefined) selectedNames.push(item.name);
      else if (configuredTypes.has(type)) customTypes.push(type);
      else {
        const known = [
          ...new Set([...available.map((entry) => entry.blockType), ...configuredTypes.keys()]),
        ].sort();
        throw new BlockError(
          "BLOCK_USAGE",
          `Unknown block type "${type}" for ${site.framework}. Available: ${known.join(", ")}.${configured === null ? " Custom blocks need the project lace.config.ts in the working directory." : ""}`,
        );
      }
    }
  }
  const closure: readonly RegistryItem[] = dependencyClosure(
    registry,
    site.framework,
    selectedNames,
  );

  const reserved = new Set([LOCK_FILE.toLowerCase(), lock0.blockMap.toLowerCase()]);
  const items: ItemOutcome[] = [];
  const files: FileDecision[] = [];
  const versionMismatches: BlockPlan["versionMismatches"][number][] = [];
  const nextItems: Record<string, LockItem> = { ...lock0.items };

  for (const item of closure) {
    const configVersion = configuredTypes.get(item.blockType);
    if (configVersion !== undefined && configVersion !== item.blockVersion) {
      versionMismatches.push({
        blockType: item.blockType,
        registryVersion: item.blockVersion,
        configVersion,
      });
      items.push({
        name: item.name,
        blockType: item.blockType,
        kind: "registry",
        revision: item.revision,
        status: "blocked",
        reason: `lace.config.ts registers ${item.blockType} version ${configVersion}; the registry component targets version ${item.blockVersion}`,
      });
      continue;
    }
    const recorded = lock0.items[item.name];
    const targets = new Map(
      item.files.map((file) => [`${lock0.componentsDir}/${file.target}`, file.bytes]),
    );
    const paths = [...new Set([...Object.keys(recorded?.files ?? {}), ...targets.keys()])].sort();
    const decisions: FileDecision[] = [];
    for (const path of paths) {
      if (reserved.has(path.toLowerCase()))
        throw new BlockError(
          "BLOCK_INPUT",
          `Block file ${path} collides with ${LOCK_FILE} or the block map; adjust componentsDir.`,
        );
      const recordedHash = recorded?.files[path] ?? null;
      decisions.push(
        decide(
          path,
          item.name,
          recordedHash,
          recordedHash !== null,
          await readSiteFile(site.root, path),
          targets.get(path),
        ),
      );
    }
    files.push(...decisions);
    const conflict = decisions.some((decision) => decision.action === "conflict");
    let status: ItemStatus;
    if (conflict) status = "conflict";
    else if (recorded === undefined) status = "added";
    else if (recorded.revision === item.revision && !decisions.some((d) => changing(d.action)))
      status = "current";
    else status = "updated";
    items.push({
      name: item.name,
      blockType: item.blockType,
      kind: "registry",
      revision: item.revision,
      status,
      ...(conflict ? { reason: "edited or untracked files differ from the registry" } : {}),
    });
    if (!conflict)
      nextItems[item.name] = {
        revision: item.revision,
        files: Object.fromEntries([...targets].map(([path, bytes]) => [path, upgradeHash(bytes)])),
      };
  }

  // Custom blocks: scaffold once, never rewrite.
  const missingRenderers: { blockType: string; reason: string }[] = [];
  const nextCustom: Record<string, LockCustomBlock> = { ...lock0.customBlocks };
  const exports = new Map<string, string>();
  const definitionFor = async (type: string) => {
    const found = await findDefinitionExport(site.root, lock0.definitions as string, type);
    exports.set(type, found.name);
    return found;
  };
  for (const type of customTypes) {
    if (lock0.definitions === undefined) {
      const reason = `record the module that exports its defineBlock value as "definitions" in ${site.display}/${LOCK_FILE}`;
      if (!options.all)
        throw new BlockError(
          "BLOCK_CONFIG",
          `Custom block "${type}" has no registry component; to scaffold one, ${reason}.`,
        );
      missingRenderers.push({ blockType: type, reason });
      continue;
    }
    const { name, fields } = await definitionFor(type);
    const path = `${lock0.componentsDir}/${customComponentFile(type)}`;
    if (reserved.has(path.toLowerCase()))
      throw new BlockError("BLOCK_INPUT", `Custom block file ${path} collides with a Lace file.`);
    const current = await readSiteFile(site.root, path);
    const recorded = lock0.customBlocks?.[type];
    if (recorded !== undefined && current !== undefined) {
      files.push({
        path,
        item: type,
        action: "preserve",
        reason: "user-owned-scaffold",
        recordedHash: recorded.files[path] ?? null,
        currentHash: hashOf(current),
        targetHash: null,
        diff: null,
      });
      items.push({
        name: type,
        blockType: type,
        kind: "custom",
        revision: null,
        status: "current",
      });
      continue;
    }
    const bytes = renderCustomScaffold({
      component: path,
      definitions: lock0.definitions,
      definitionExport: name,
      fields: fields as Record<string, ScaffoldField>,
    });
    const decision = decide(path, type, null, recorded !== undefined, current, bytes);
    files.push(decision);
    if (decision.action === "conflict") {
      items.push({
        name: type,
        blockType: type,
        kind: "custom",
        revision: null,
        status: "conflict",
        reason: "a different file already exists at the scaffold path",
      });
      continue;
    }
    items.push({
      name: type,
      blockType: type,
      kind: "custom",
      revision: null,
      status: "scaffolded",
    });
    nextCustom[type] = { files: { [path]: upgradeHash(bytes) } };
  }

  // Block map from the resulting lock state.
  const entries: MapEntry[] = [];
  for (const [name, record] of Object.entries(nextItems)) {
    const item = registry.items.get(`${site.framework}/${name}`);
    const component = Object.keys(record.files).sort()[0];
    if (item === undefined || component === undefined) continue;
    entries.push({ type: item.blockType, component });
  }
  for (const [type, record] of Object.entries(nextCustom)) {
    const component = Object.keys(record.files).sort()[0];
    if (component === undefined || lock0.definitions === undefined) continue;
    const name = exports.get(type) ?? (await definitionFor(type)).name;
    entries.push({ type, component, definitionExport: name });
  }
  const names = new Set<string>();
  for (const entry of entries) {
    const name = entry.component.split("/").at(-1)!.toLowerCase();
    if (names.has(name))
      throw new BlockError("BLOCK_INPUT", `Two blocks use the component file name ${name}.`);
    names.add(name);
  }
  const mapTarget = renderBlockMap(lock0.blockMap, entries, lock0.definitions);
  const mapCurrent = await readSiteFile(site.root, lock0.blockMap);
  const mapDecision = decide(
    lock0.blockMap,
    "block map",
    lock0.blockMapSha256,
    lock0.blockMapSha256 !== null,
    mapCurrent,
    mapTarget,
  );
  // An untracked map may be overwritten only when it does not exist.
  const entriesToAdd =
    mapDecision.action === "conflict" && mapCurrent !== undefined
      ? missingMapLines(mapCurrent.toString("utf8"), lock0.blockMap, entries, lock0.definitions)
      : [];
  const finalLock: SiteLock = {
    ...lock0,
    blockMapSha256:
      mapDecision.action === "conflict" ? lock0.blockMapSha256 : upgradeHash(mapTarget),
    items: nextItems,
    ...(Object.keys(nextCustom).length === 0 ? {} : { customBlocks: nextCustom }),
  };
  const lockBytes = serializeLock(finalLock);
  const lockAction =
    site.lockBytes === undefined ? "add" : site.lockBytes.equals(lockBytes) ? "current" : "replace";

  // Package requirements of every selected registry item.
  const required = new Map<string, string>();
  for (const item of closure)
    for (const [name, range] of Object.entries(item.requires)) required.set(name, range);
  const missing: { name: string; range: string; installed: string | null }[] = [];
  for (const [name, range] of [...required].sort(([a], [b]) => a.localeCompare(b))) {
    const installed = (await installedVersion(site.root, name)) ?? null;
    if (installed === null || !satisfies(installed, range, { includePrerelease: true }))
      missing.push({ name, range, installed });
  }
  const conflicts =
    files.filter((decision) => decision.action === "conflict").length +
    (mapDecision.action === "conflict" ? 1 : 0) +
    versionMismatches.length;
  const changes =
    files.filter((decision) => changing(decision.action) && decisionWritable(decision, items))
      .length +
    (changing(mapDecision.action) ? 1 : 0) +
    (lockAction === "current" ? 0 : 1);
  return {
    schemaVersion: 1,
    site: site.display,
    framework: site.framework,
    configChecked: configured !== null,
    items,
    files,
    blockMap: { ...mapDecision, entriesToAdd },
    lock: {
      path: LOCK_FILE,
      action: lockAction,
      bytes: lockBytes,
      currentHash: hashOf(site.lockBytes),
    },
    packages: {
      missing,
      command:
        missing.length === 0
          ? null
          : `pnpm --dir ${shellWord(site.display)} add ${missing.map((entry) => shellWord(`${entry.name}@${entry.range}`)).join(" ")}`,
    },
    versionMismatches,
    missingRenderers,
    conflicts,
    changes,
  };
}

/** Files of an item with any conflict stay untouched. */
export function decisionWritable(decision: FileDecision, items: readonly ItemOutcome[]): boolean {
  return items.some(
    (item) =>
      item.name === decision.item && item.status !== "conflict" && item.status !== "blocked",
  );
}
