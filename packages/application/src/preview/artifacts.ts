import type { MediaId } from "@lacecms/domain";
import type { Clock } from "../ports/infrastructure.js";
import type { ByteStream } from "../ports/media.js";
import type { PreviewClaim, PreviewCommandPort, PreviewObject } from "../ports/preview.js";
import type { PreviewBlobStorage, PreviewByteRange } from "../ports/preview-storage.js";
import {
  defaultPreviewPackageLimits,
  describePreviewBytes,
  encodePreviewJson,
  parsePreviewManifest,
  previewGenerationKey,
  readPreviewJson,
  readPreviewManifest,
} from "./manifest.js";
import type {
  PreviewPackageFile,
  PreviewPackageLimits,
  PreviewPackageManifest,
} from "./manifest.js";

const outputPrefix = (id: string) => `${previewGenerationKey(id)}output/`;
const manifestKey = (id: string) => `${outputPrefix(id)}manifest.json`;
const filePrefix = (id: string) => `${outputPrefix(id)}files/`;
const usageKey = (id: string) => `${outputPrefix(id)}media.json`;
const fileKey = (id: string, file: PreviewPackageFile) => `${filePrefix(id)}${file.sha256}`;
type Claim = Omit<PreviewClaim, "now">;

function matchingObject(left: PreviewObject, right: PreviewObject): boolean {
  return left.sha256 === right.sha256 && left.bytes === right.bytes;
}

export class PreviewPackages {
  readonly #limits: PreviewPackageLimits;

  public constructor(
    private readonly blobs: PreviewBlobStorage,
    private readonly execution: Pick<
      PreviewCommandPort,
      "runningPreview" | "finalizePreview" | "confirmedPreviewOutput"
    >,
    private readonly clock: Clock,
    limits: Partial<PreviewPackageLimits> = {},
  ) {
    this.#limits = { ...defaultPreviewPackageLimits, ...limits };
    for (const name of Object.keys(defaultPreviewPackageLimits) as (keyof PreviewPackageLimits)[]) {
      const value = this.#limits[name];
      if (!Number.isSafeInteger(value) || value < 1 || value > defaultPreviewPackageLimits[name])
        throw new TypeError("Invalid preview package limits.");
    }
  }

  /** Freeze an exact file inventory before staging bytes, including independent upload retries. */
  public async prepare(claim: Claim, value: unknown): Promise<PreviewObject | null> {
    if (!(await this.running(claim))) return null;
    const manifest = parsePreviewManifest(value, this.#limits);
    if (!manifest) return null;
    const body = encodePreviewJson(manifest);
    if (body.byteLength > this.#limits.manifestBytes) return null;
    const object = await describePreviewBytes(body);
    if (!(await this.running(claim))) return null;
    const key = manifestKey(claim.id);
    const result = await this.blobs.put({ key, body, ...object });
    if (result === "created") return object;
    // Refuse a conflicting retry before opening a stream for the sealed manifest.
    if ((await this.blobs.head(key)) !== object.bytes) return null;
    return (await this.manifest(claim.id, object)) ? object : null;
  }

  public async stage(
    claim: Claim,
    path: string,
    object: PreviewObject,
    body: Uint8Array | ByteStream,
  ): Promise<boolean> {
    if (!(await this.running(claim))) return false;
    const manifest = await this.manifest(claim.id);
    const file = manifest?.files.find((file) => file.path === path);
    if (!file || !matchingObject(file, object) || !(await this.running(claim))) return false;
    const key = fileKey(claim.id, file);
    const result = await this.blobs.put({ key, body, bytes: file.bytes, sha256: file.sha256 });
    return result === "created" || (await this.blobs.head(key)) === file.bytes;
  }

  public async prepareOutput(claim: Claim, value: unknown, media: readonly MediaId[]) {
    const output = await this.prepare(claim, value);
    if (!output || !(await this.running(claim))) return null;
    const body = encodePreviewJson({ output, media });
    if (body.byteLength > this.#limits.manifestBytes) return null;
    const object = await describePreviewBytes(body);
    const key = usageKey(claim.id);
    if ((await this.blobs.put({ key, body, ...object })) === "created") return output;
    const previous = await this.blobs.get(key);
    return previous &&
      (await readPreviewJson(
        previous.body,
        previous.bytes,
        this.#limits.manifestBytes,
        object.sha256,
      ))
      ? output
      : null;
  }

  public async completeOutput(claim: Claim, output: PreviewObject) {
    if (!(await this.running(claim)))
      return this.execution.confirmedPreviewOutput({ ...claim, output, now: this.clock.now() });
    const object = await this.blobs.get(usageKey(claim.id));
    if (!object) return false;
    const metadata = (await readPreviewJson(
      object.body,
      object.bytes,
      this.#limits.manifestBytes,
    )) as {
      readonly output: PreviewObject;
      readonly media: readonly MediaId[];
    } | null;
    return (
      !!metadata &&
      matchingObject(output, metadata.output) &&
      this.complete(claim, output, metadata.media)
    );
  }

  public async complete(claim: Claim, output: PreviewObject, media: readonly MediaId[]) {
    if (!(await this.running(claim)))
      return this.execution.confirmedPreviewOutput({ ...claim, output, now: this.clock.now() });
    const manifest = await this.manifest(claim.id, output);
    if (!manifest || !(await this.hasAllFiles(claim.id, manifest))) return false;
    return this.execution.finalizePreview({ ...claim, output, media, now: this.clock.now() });
  }

  public async manifest(
    id: string,
    expected?: PreviewObject,
  ): Promise<PreviewPackageManifest | null> {
    const object = await this.blobs.get(manifestKey(id));
    if (!object || (expected && object.bytes !== expected.bytes)) return null;
    return readPreviewManifest(
      object.body,
      object.bytes,
      this.#limits.manifestBytes,
      expected?.sha256,
      this.#limits,
    );
  }

  public async exists(id: string, file: PreviewPackageFile) {
    return (await this.blobs.head(fileKey(id, file))) === file.bytes;
  }

  public async read(id: string, file: PreviewPackageFile, range?: PreviewByteRange) {
    const object = await this.blobs.get(fileKey(id, file), range);
    return object && object.bytes === (range?.length ?? file.bytes) ? object.body : null;
  }

  private async hasAllFiles(id: string, manifest: PreviewPackageManifest): Promise<boolean> {
    const expected = new Map(manifest.files.map((file) => [fileKey(id, file), file.bytes]));
    let cursor: string | undefined;
    // R2/S3 list returns up to 1,000 entries. Permit bounded partial pages.
    for (let page = 0; page < 8; page++) {
      const result = await this.blobs.list(filePrefix(id), 1000, cursor);
      for (const object of result.objects) {
        if (expected.get(object.key) !== object.bytes) return false;
        expected.delete(object.key);
      }
      if (result.cursor === undefined) return expected.size === 0;
      if (result.cursor === cursor) return false;
      cursor = result.cursor;
    }
    return false;
  }

  private running(claim: Claim) {
    return this.execution.runningPreview({ ...claim, now: this.clock.now() });
  }
}

export type PreviewArtifactReader = Pick<PreviewPackages, "manifest" | "exists" | "read">;
