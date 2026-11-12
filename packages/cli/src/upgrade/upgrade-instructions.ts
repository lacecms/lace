import { readUpgradeFile, UpgradeError } from "./upgrade-input.js";

export interface UpgradeInstructions {
  readonly schemaVersion: 1;
  readonly templateVersion: string;
  readonly database: readonly string[];
  readonly configuration: readonly string[];
}

export function validateUpgradeInstructions(value: unknown, version: string): UpgradeInstructions {
  const input = value as Partial<UpgradeInstructions> | null;
  const validList = (list: unknown): list is string[] =>
    Array.isArray(list) &&
    list.length <= 100 &&
    list.every(
      (item: unknown) =>
        typeof item === "string" &&
        item.trim().length > 0 &&
        item.length <= 8000 &&
        [...item].every((character) => {
          const code = character.charCodeAt(0);
          return code === 9 || code === 10 || (code >= 32 && (code < 127 || code > 159));
        }),
    );
  if (
    !input ||
    typeof input !== "object" ||
    Array.isArray(input) ||
    Object.keys(input).sort().join(",") !==
      "configuration,database,schemaVersion,templateVersion" ||
    input.schemaVersion !== 1 ||
    input.templateVersion !== version ||
    !validList(input.database) ||
    !validList(input.configuration)
  )
    throw new UpgradeError(
      "UPGRADE_INPUT",
      "Invalid upgrade instructions: require schema 1, matching target version and bounded plain-text database/configuration lists.",
    );
  return {
    schemaVersion: 1,
    templateVersion: version,
    database: input.database,
    configuration: input.configuration,
  };
}

export async function readUpgradeInstructions(
  root: string,
  version: string,
): Promise<UpgradeInstructions | null> {
  const bytes = await readUpgradeFile(root, ".lace/upgrade-instructions.json");
  if (bytes === undefined) return null;
  let value: unknown;
  try {
    value = JSON.parse(bytes.toString("utf8"));
  } catch {
    throw new UpgradeError("UPGRADE_INPUT", "Upgrade instructions must be valid JSON.");
  }
  return validateUpgradeInstructions(value, version);
}

export function presentUpgradeInstructions(
  version: string,
  instructions: UpgradeInstructions | null,
): string {
  return [
    `Migration guidance for ${version}:`,
    ...(instructions === null
      ? ["No version-specific instructions supplied."]
      : [
          ...instructions.database.map((item) => `Database: ${item}`),
          ...instructions.configuration.map((item) => `Configuration: ${item}`),
        ]),
    "Database migrations and configuration synchronization are explicit deployment steps. Upgrade does not run them; filesystem rollback does not undo database migrations.",
  ].join("\n");
}
