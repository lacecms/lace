import type { BuildContentExportPage } from "../ports/content.js";
import type { PreviewBlobStorage } from "../ports/preview-storage.js";
import type { PreviewInputStore, PreviewObject, PreviewTarget } from "../ports/preview.js";
import { previewNamespaceCleanup } from "./delivery-maintenance.js";
import {
  describePreviewBytes,
  encodePreviewJson,
  previewGenerationKey,
  readPreviewJson,
} from "./manifest.js";

const maxCaptureBytes = 8 * 1024 * 1024;
const prefix = (id: string) => `${previewGenerationKey(id)}input/`;

/** The seal binds the target and ordered records to their exact bounded private bytes. */
export class PreviewFrozenInputs<Metadata> implements PreviewInputStore {
  public constructor(
    private readonly blobs: PreviewBlobStorage,
    private readonly metadata: Metadata,
  ) {}

  public writeTarget(id: string, target: PreviewTarget) {
    return this.write(`${prefix(id)}target.json`, target);
  }

  public writeContextPage(id: string, index: number, page: BuildContentExportPage) {
    return this.write(`${prefix(id)}page-${index}.json`, page);
  }

  public sealInput(id: string, target: PreviewObject, pages: readonly PreviewObject[]) {
    return this.write(`${prefix(id)}manifest.json`, { target, pages, metadata: this.metadata });
  }

  public async read(id: string, seal: PreviewObject) {
    const base = prefix(id);
    const manifest = (await this.readJson(`${base}manifest.json`, seal, 128 * 1024)) as {
      readonly target: PreviewObject;
      readonly pages: readonly PreviewObject[];
      readonly metadata: Metadata;
    } | null;
    if (!manifest || manifest.pages.length < 1 || manifest.pages.length > 3) return null;
    const bytes = manifest.target.bytes + manifest.pages.reduce((sum, page) => sum + page.bytes, 0);
    if (bytes > maxCaptureBytes) return null;
    const target = (await this.readJson(
      `${base}target.json`,
      manifest.target,
      maxCaptureBytes,
    )) as PreviewTarget | null;
    if (!target) return null;
    const pages: BuildContentExportPage[] = [];
    for (const [index, ref] of manifest.pages.entries()) {
      const page = (await this.readJson(
        `${base}page-${index}.json`,
        ref,
        maxCaptureBytes,
      )) as BuildContentExportPage | null;
      if (!page) return null;
      pages.push(page);
    }
    return { target, pages, metadata: manifest.metadata };
  }

  public purge(...args: Parameters<PreviewInputStore["purge"]>) {
    return previewNamespaceCleanup(this.blobs).purge(...args);
  }

  private async write(key: string, value: unknown) {
    const body = encodePreviewJson(value);
    if (body.byteLength > maxCaptureBytes)
      throw new Error("Preview input exceeds its capture limit.");
    const object = await describePreviewBytes(body);
    if (
      (await this.blobs.put({ key, body, ...object })) !== "created" &&
      (await this.readJson(key, object, maxCaptureBytes)) === null
    )
      throw new Error("Preview input is already sealed with different contents.");
    return object;
  }

  private async readJson(key: string, ref: PreviewObject, limit: number) {
    const object = await this.blobs.get(key);
    if (!object) return null;
    return readPreviewJson(object.body, ref.bytes, limit, ref.sha256);
  }
}
