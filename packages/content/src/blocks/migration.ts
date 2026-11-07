import type { JsonObject } from "../shared/json.js";
import { normalizeJsonValue } from "../shared/json.js";
import { LaceError, FieldConfigurationError } from "../shared/errors.js";
import { isRecord, deepFreeze } from "../shared/objects.js";
import type {
  BlockDefinition,
  BlockMigration,
  BlockMigrationInput,
  BlockMigrations,
} from "./types.js";
import { blockFail } from "./errors.js";

const MIGRATION_KEY_PATTERN = /^[1-9][0-9]*$/u;

export function normalizeBlockMigrations(
  value: unknown,
  version: number,
): BlockMigrations | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) {
    blockFail("migrations must be a plain object keyed by target version.");
  }
  const keys = Object.keys(value);
  if (keys.length === 0) return undefined;
  const targets: number[] = [];
  for (const key of keys) {
    const target = Number(key);
    if (!MIGRATION_KEY_PATTERN.test(key) || !Number.isSafeInteger(target)) {
      blockFail(`migrations.${key} must be keyed by an integer target version.`);
    }
    if (target < 2 || target > version) {
      blockFail(`migrations.${key} must target a version from 2 to ${version}.`);
    }
    if (typeof value[key] !== "function") {
      blockFail(`migrations.${key} must be a function.`);
    }
    targets.push(target);
  }
  targets.sort((left, right) => left - right);
  if (targets.at(-1) !== version) {
    blockFail(`migrations must include the current version ${version}.`);
  }
  for (let index = 1; index < targets.length; index += 1) {
    if (targets[index] !== targets[index - 1]! + 1) {
      blockFail(`migrations.${targets[index - 1]! + 1} is missing; migrations must be contiguous.`);
    }
  }
  return Object.freeze(
    Object.fromEntries(targets.map((target) => [target, value[String(target)] as BlockMigration])),
  );
}

/** Why stored block data could not be migrated to the current block version. */
export type BlockMigrationErrorCode =
  | "invalid_result"
  | "migration_failed"
  | "missing_step"
  | "version_ahead";

/** Thrown when stored block data cannot be migrated to its definition's version. */
export class BlockMigrationError extends LaceError<BlockMigrationErrorCode> {
  public constructor(
    code: BlockMigrationErrorCode,
    public readonly blockType: string,
    public readonly fromVersion: number,
    public readonly toVersion: number,
    message: string,
    /** Target version of the failing step, for failed or invalid steps. */
    public readonly step?: number,
    options?: { readonly cause?: unknown },
  ) {
    super(code, message, options);
    this.name = "BlockMigrationError";
  }
}

function jsonObject(value: unknown, name: string): JsonObject {
  if (value instanceof Promise || !isRecord(value)) {
    throw new FieldConfigurationError(`${name} must be a plain JSON object.`);
  }
  return deepFreeze(normalizeJsonValue(value, name)) as JsonObject;
}

/** Checks a step result: `{data, settings?}`; absent settings keep `previous`. */
function migrationResult(value: unknown, previous: JsonObject): BlockMigrationInput {
  if (value instanceof Promise || !isRecord(value)) {
    throw new FieldConfigurationError("result must be a plain object.");
  }
  for (const key of Object.keys(value)) {
    if (key !== "data" && key !== "settings") {
      throw new FieldConfigurationError(`result.${key} is not permitted.`);
    }
  }
  if (!Object.hasOwn(value, "data")) {
    throw new FieldConfigurationError("result.data is required.");
  }
  return Object.freeze({
    data: jsonObject(value.data, "result.data"),
    settings:
      value.settings === undefined ? previous : jsonObject(value.settings, "result.settings"),
  });
}

/**
 * Migrates stored block data and settings from `fromVersion` to the
 * definition's version by composing its declared migrations in ascending
 * order. Each step receives a detached, frozen copy. The result is not
 * validated against the definition.
 */
export function migrateBlockData(
  definition: BlockDefinition,
  block: BlockMigrationInput,
  fromVersion: number,
): BlockMigrationInput {
  const toVersion = definition.version;
  function fail(
    code: BlockMigrationErrorCode,
    message: string,
    step?: number,
    cause?: unknown,
  ): never {
    throw new BlockMigrationError(
      code,
      definition.type,
      fromVersion,
      toVersion,
      message,
      step,
      cause === undefined ? undefined : { cause },
    );
  }
  if (fromVersion > toVersion) {
    fail(
      "version_ahead",
      `Block ${definition.type} version ${fromVersion} is newer than ${toVersion}.`,
    );
  }
  let current: BlockMigrationInput;
  try {
    current = Object.freeze({
      data: jsonObject(block.data, "data"),
      settings: jsonObject(block.settings, "settings"),
    });
  } catch (error) {
    fail(
      "invalid_result",
      `Block ${definition.type} data or settings are not JSON objects.`,
      fromVersion,
      error,
    );
  }
  for (let step = fromVersion + 1; step <= toVersion; step += 1) {
    const migration = definition.migrations?.[step];
    if (migration === undefined) {
      fail(
        "missing_step",
        `Block ${definition.type} has no migration from version ${fromVersion} to ${toVersion}.`,
      );
    }
    let output: unknown;
    try {
      output = migration(current);
    } catch (error) {
      fail(
        "migration_failed",
        `Block ${definition.type} migration to version ${step} threw.`,
        step,
        error,
      );
    }
    try {
      current = migrationResult(output, current.settings);
    } catch (error) {
      fail(
        "invalid_result",
        `Block ${definition.type} migration to version ${step} did not return {data, settings?} JSON objects.`,
        step,
        error,
      );
    }
  }
  return current;
}
