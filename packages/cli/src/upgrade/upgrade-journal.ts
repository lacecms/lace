import { readUpgradeFile, validateUpgradeManifest, upgradeHash } from "./upgrade-input.js";
import type { UpgradeManifest } from "./upgrade-input.js";
import { hashOrAbsent, inputFailure, inspectInventory, parseJson, shape } from "./upgrade-files.js";
import { validateUpgradeInstructions } from "./upgrade-instructions.js";
import type { UpgradeInstructions } from "./upgrade-instructions.js";

export const metadataRoot = ".lace/upgrade";
export const latestPath = `${metadataRoot}/latest.json`;
export type Phase = "applying" | "applied" | "rolling-back" | "rolled-back";
export interface Pointer {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly phase: Phase;
}
export interface Entry {
  readonly path: string;
  readonly beforeHash: string | null;
  readonly afterHash: string | null;
  readonly beforeMode: number | null;
  readonly afterMode: number | null;
}
export interface Guard {
  readonly path: string;
  readonly hash: string | null;
}
export interface Operation {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly oldManifestHash: string;
  readonly newManifestHash: string;
  readonly target: UpgradeManifest;
  readonly instructions: UpgradeInstructions | null;
  readonly manifestMode: number;
  readonly entries: readonly Entry[];
  readonly guards: readonly Guard[];
  readonly directories: readonly string[];
}
export interface SavedOperation {
  readonly pointer: Pointer;
  readonly operation: Operation;
  readonly oldBytes: Buffer;
  readonly newBytes: Buffer;
  readonly before: readonly (Buffer | undefined)[];
  readonly after: readonly (Buffer | undefined)[];
}
const idPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;
const digest = (value: unknown): value is string =>
  typeof value === "string" && /^[0-9a-f]{64}$/u.test(value);
const mode = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 0o777;
export const transactionPath = (id: string): string => `${metadataRoot}/transactions/${id}`;

export function mergedManifest(old: UpgradeManifest, target: UpgradeManifest): UpgradeManifest {
  const files = { ...target.files };
  for (const [path, owner] of Object.entries(old.files))
    if (owner.owner === "user") files[path] = owner;
  return validateUpgradeManifest({ ...target, files });
}

export function validatePointer(value: unknown): Pointer {
  if (
    !shape(value, ["schemaVersion", "id", "phase"]) ||
    value.schemaVersion !== 1 ||
    typeof value.id !== "string" ||
    !idPattern.test(value.id) ||
    !["applying", "applied", "rolling-back", "rolled-back"].includes(String(value.phase))
  )
    return inputFailure("Invalid or unsupported upgrade recovery pointer.");
  return value as unknown as Pointer;
}

export function validateOperation(
  value: unknown,
  pointer: Pointer,
  oldBytes: Buffer,
  newBytes: Buffer,
): Operation {
  if (
    !shape(value, [
      "schemaVersion",
      "id",
      "oldManifestHash",
      "newManifestHash",
      "target",
      "instructions",
      "manifestMode",
      "entries",
      "guards",
      "directories",
    ]) ||
    value.schemaVersion !== 1 ||
    value.id !== pointer.id ||
    !digest(value.oldManifestHash) ||
    value.oldManifestHash !== upgradeHash(oldBytes) ||
    !digest(value.newManifestHash) ||
    value.newManifestHash !== upgradeHash(newBytes) ||
    !mode(value.manifestMode) ||
    !Array.isArray(value.entries) ||
    !Array.isArray(value.guards) ||
    !Array.isArray(value.directories)
  )
    return inputFailure("Invalid or corrupted upgrade operation metadata.");
  const old = validateUpgradeManifest(parseJson(oldBytes, "Saved old manifest"));
  const next = validateUpgradeManifest(parseJson(newBytes, "Saved new manifest"));
  const target = validateUpgradeManifest(value.target);
  if (JSON.stringify(next) !== JSON.stringify(mergedManifest(old, target)))
    inputFailure("Saved manifest does not preserve ownership or match target.");
  const instructions =
    value.instructions === null
      ? null
      : validateUpgradeInstructions(value.instructions, target.templateVersion);
  const seen = new Set<string>();
  const checkPath = (path: unknown): string => {
    if (typeof path !== "string") return inputFailure("Invalid operation path.");
    // Reuse inventory path rules, including reserved source, traversal and overlapping paths.
    validateUpgradeManifest({
      schemaVersion: 1,
      templateVersion: "1",
      site: { mode: "starter", path: "site" },
      files: { [path]: { owner: "managed", sha256: "0".repeat(64) } },
    });
    if (
      old.files[path]?.owner === "user" ||
      next.files[path]?.owner === "user" ||
      seen.has(path.toLowerCase())
    )
      return inputFailure("Operation paths contain user ownership or case aliases.");
    seen.add(path.toLowerCase());
    return path;
  };
  const entries: Entry[] = value.entries.map((item: unknown) => {
    if (!shape(item, ["path", "beforeHash", "afterHash", "beforeMode", "afterMode"]))
      return inputFailure("Invalid operation entry.");
    const path = checkPath(item.path);
    if (
      (item.beforeHash !== null && !digest(item.beforeHash)) ||
      (item.afterHash !== null && !digest(item.afterHash)) ||
      (item.beforeHash === null ? item.beforeMode !== null : !mode(item.beforeMode)) ||
      (item.afterHash === null ? item.afterMode !== null : !mode(item.afterMode)) ||
      item.beforeHash === item.afterHash ||
      (item.beforeHash !== null &&
        (old.files[path]?.owner !== "managed" || old.files[path].sha256 !== item.beforeHash)) ||
      (item.beforeHash === null && old.files[path] !== undefined) ||
      (item.afterHash !== null &&
        (next.files[path]?.owner !== "managed" || next.files[path].sha256 !== item.afterHash)) ||
      (item.afterHash === null && next.files[path] !== undefined)
    )
      return inputFailure("Operation entry does not match saved ownership baselines.");
    return item as unknown as Entry;
  });
  const guards: Guard[] = value.guards.map((item: unknown) => {
    if (!shape(item, ["path", "hash"])) return inputFailure("Invalid operation guard.");
    const path = checkPath(item.path);
    if (
      (item.hash !== null && !digest(item.hash)) ||
      (old.files[path]?.owner !== "managed" && next.files[path]?.owner !== "managed")
    )
      return inputFailure("Invalid operation guard ownership/hash.");
    const baselineHash = old.files[path]?.owner === "managed" ? old.files[path].sha256 : null;
    const targetHash = next.files[path]?.owner === "managed" ? next.files[path].sha256 : null;
    if (item.hash !== targetHash && baselineHash !== targetHash)
      inputFailure("Operation guard omits a required managed mutation.");
    return item as unknown as Guard;
  });
  // Every non-user path is guarded, so a tampered operation cannot silently omit a mutation.
  for (const path of new Set([...Object.keys(old.files), ...Object.keys(next.files)])) {
    if (
      old.files[path]?.owner !== "user" &&
      next.files[path]?.owner !== "user" &&
      !seen.has(path.toLowerCase())
    )
      inputFailure("Operation is missing a managed path guard.");
  }
  inspectInventory([...Object.keys(old.files), ...Object.keys(target.files)]);
  const directories: string[] = [];
  for (const directory of value.directories) {
    if (
      typeof directory !== "string" ||
      directories.includes(directory) ||
      !entries.some((entry) => entry.path.startsWith(`${directory}/`))
    )
      inputFailure("Invalid operation-created directory.");
    validateUpgradeManifest({
      schemaVersion: 1,
      templateVersion: "1",
      site: { mode: "starter", path: "site" },
      files: { [directory]: { owner: "managed", sha256: "0".repeat(64) } },
    });
    directories.push(directory);
  }
  return {
    schemaVersion: 1,
    id: pointer.id,
    oldManifestHash: value.oldManifestHash,
    newManifestHash: value.newManifestHash,
    target,
    instructions,
    manifestMode: value.manifestMode,
    entries,
    guards,
    directories,
  };
}

export async function loadOperation(project: string): Promise<SavedOperation | null> {
  const bytes = await readUpgradeFile(project, latestPath);
  if (bytes === undefined) return null;
  const pointer = validatePointer(parseJson(bytes, "Recovery pointer"));
  const base = transactionPath(pointer.id);
  const oldBytes = await readUpgradeFile(project, `${base}/old-manifest.json`);
  const newBytes = await readUpgradeFile(project, `${base}/new-manifest.json`);
  const operationBytes = await readUpgradeFile(project, `${base}/operation.json`);
  if (!oldBytes || !newBytes || !operationBytes)
    return inputFailure(
      "Upgrade recovery records are incomplete; preserve .lace/upgrade/ and restore from backup.",
    );
  const operation = validateOperation(
    parseJson(operationBytes, "Operation metadata"),
    pointer,
    oldBytes,
    newBytes,
  );
  const before: (Buffer | undefined)[] = [],
    after: (Buffer | undefined)[] = [];
  for (const [index, entry] of operation.entries.entries()) {
    const a = await readUpgradeFile(project, `${base}/before/${index}`);
    const b = await readUpgradeFile(project, `${base}/after/${index}`);
    if (hashOrAbsent(a) !== entry.beforeHash || hashOrAbsent(b) !== entry.afterHash)
      inputFailure("Saved upgrade bytes are corrupt or missing.");
    before.push(a);
    after.push(b);
  }
  return { pointer, operation, oldBytes, newBytes, before, after };
}
