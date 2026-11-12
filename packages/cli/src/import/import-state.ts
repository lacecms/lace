import { readFile, realpath } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import * as v from "valibot";
import { ImportError } from "./import-format.js";
import { atomicWrite } from "../upgrade/upgrade-files.js";

export const STATE_FILE = "lace-import.state.json";

const identifier = v.pipe(v.string(), v.minLength(1), v.maxLength(255));
const stateMediaSchema = v.strictObject({
  id: identifier,
  sha256: v.pipe(v.string(), v.regex(/^[0-9a-f]{64}$/u)),
});
const stateEntrySchema = v.strictObject({
  id: identifier,
  model: identifier,
  revision: v.pipe(v.number(), v.integer(), v.minValue(0)),
});
const targetSchema = v.strictObject({
  media: v.record(v.string(), stateMediaSchema),
  entries: v.record(v.string(), stateEntrySchema),
});
const stateSchema = v.strictObject({
  formatVersion: v.literal(1),
  targets: v.record(v.string(), targetSchema),
});

export type StateMedia = v.InferOutput<typeof stateMediaSchema>;
export type StateEntry = v.InferOutput<typeof stateEntrySchema>;
type ImportStateData = v.InferOutput<typeof stateSchema>;

/**
 * Key-to-ID hints and written revisions per API origin. Holds no secrets;
 * every hint is verified against the server before use.
 */
export class ImportState {
  readonly #path: string;
  readonly #origin: string;
  readonly #data: ImportStateData;

  private constructor(path: string, origin: string, data: ImportStateData) {
    this.#path = path;
    this.#origin = origin;
    this.#data = data;
    data.targets[origin] ??= { media: {}, entries: {} };
  }

  /** Reads the state file; a missing file is empty, a malformed one fails. */
  public static async open(requested: string, origin: string): Promise<ImportState> {
    // Atomic writes refuse symbolic-link parents, so resolve the directory once.
    const path = join(
      await realpath(dirname(requested)).catch(() => dirname(requested)),
      basename(requested),
    );
    let text: string;
    try {
      text = await readFile(path, "utf8");
    } catch (error) {
      if ((error as { code?: unknown }).code === "ENOENT")
        return new ImportState(path, origin, { formatVersion: 1, targets: {} });
      throw new ImportError("IMPORT_SETTINGS", "The import state file cannot be read.");
    }
    let parsed: v.SafeParseResult<typeof stateSchema>;
    try {
      parsed = v.safeParse(stateSchema, JSON.parse(text));
    } catch {
      parsed = { success: false } as never;
    }
    if (!parsed.success)
      throw new ImportError(
        "IMPORT_SETTINGS",
        "The import state file is malformed; restore it or remove it to rely on server lookups.",
      );
    return new ImportState(path, origin, parsed.output);
  }

  get #target() {
    return this.#data.targets[this.#origin]!;
  }

  public media(key: string): StateMedia | undefined {
    return Object.hasOwn(this.#target.media, key) ? this.#target.media[key] : undefined;
  }

  public entry(key: string): StateEntry | undefined {
    return Object.hasOwn(this.#target.entries, key) ? this.#target.entries[key] : undefined;
  }

  public setMedia(key: string, value: StateMedia): void {
    this.#target.media[key] = value;
  }

  public setEntry(key: string, value: StateEntry): void {
    this.#target.entries[key] = value;
  }

  /** Atomically replaces the state file. */
  public async save(): Promise<void> {
    try {
      await atomicWrite(
        dirname(this.#path),
        basename(this.#path),
        Buffer.from(`${JSON.stringify(this.#data, null, 2)}\n`),
        0o644,
      );
    } catch {
      throw new ImportError(
        "IMPORT_FAILED",
        "The import state file could not be written; completed writes are matched again by server lookups on the next run.",
      );
    }
  }
}
