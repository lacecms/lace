import assert from "node:assert/strict";
import { readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const legacyConsumer = `
import { createLaceClient, type LaceClient } from "@lacecms/sdk";

function unsupported(): never { throw new Error("Only used as a type fixture"); }

class CustomClient implements LaceClient {
  getAllCollection = unsupported;
  getBuildExport = unsupported;
  getBuildExportPage = unsupported;
  getByPath = unsupported;
  getCollection = unsupported;
  getCollectionBySlug = unsupported;
  getGlobal = unsupported;
  listRecords = unsupported;
  getPage = unsupported;
  getPublicMediaUrl = unsupported;
}

const mock: LaceClient = { ...new CustomClient() };
const factory: LaceClient = createLaceClient({ baseUrl: "https://cms.example" });
export { mock, factory };
`;

const thumbnailConsumer = `
import { createLaceClient, type BuildThumbnailResult, type LaceClient } from "@lacecms/sdk";

const factory = createLaceClient({ baseUrl: "https://cms.example" });
export const client: LaceClient = factory;
export const thumbnail: Promise<BuildThumbnailResult> = factory.getBuildThumbnail("media");
`;

export async function verifySdkDeclarations(original, target, { run, workspace }) {
  const installedDeclaration = (project) =>
    join(project, "site/node_modules/@lacecms/sdk/dist/client/client.d.ts");
  const shape = async (project) => {
    const source = await readFile(installedDeclaration(project), "utf8");
    const exported = /^export interface LaceClient \{\n([\s\S]+?)^\}/mu.exec(source)?.[1];
    assert.ok(exported, "The installed SDK must expose the base LaceClient declaration");
    return exported.replace(/\/\*\*[\s\S]*?\*\//gu, "").replace(/\s+/gu, "");
  };
  assert.equal(await shape(target), await shape(original));

  for (const [project, stage] of [
    [original, "published"],
    [target, "candidate"],
  ]) {
    const site = join(project, "site");
    const legacy = join(site, "lace-client-legacy-probe.mts");
    const thumbnail = join(site, "lace-client-thumbnail-probe.mts");
    try {
      await writeFile(legacy, legacyConsumer);
      if (stage === "candidate") await writeFile(thumbnail, thumbnailConsumer);
      await run(
        `sdk-${stage}-declarations`,
        process.execPath,
        [
          join(workspace, "node_modules/typescript/bin/tsc"),
          "--ignoreConfig",
          "--strict",
          "--noEmit",
          "--module",
          "nodenext",
          "--target",
          "es2023",
          legacy,
          ...(stage === "candidate" ? [thumbnail] : []),
        ],
        { cwd: site },
      );
    } finally {
      await rm(legacy, { force: true });
      if (stage === "candidate") await rm(thumbnail, { force: true });
    }
  }
}

export async function verifyLegacySdk(project, baseUrl, token, publishedPath, entryId) {
  const path = join(project, "site/node_modules/@lacecms/sdk");
  const manifest = JSON.parse(await readFile(join(path, "package.json"), "utf8"));
  assert.equal(manifest.version, "1.0.0");
  const { createLaceClient } = await import(pathToFileURL(join(path, "dist/index.js")));
  const requests = [];
  const client = createLaceClient({
    baseUrl,
    token,
    fetch: (url, init) => {
      requests.push(new URL(url).pathname);
      return fetch(url, init);
    },
  });
  assert.equal((await client.getByPath(publishedPath)).entry.id, entryId);
  const first = await client.getBuildExport();
  assert.ok(first.changed);
  assert.equal(first.export.formatVersion, 2);
  assert.ok(first.export.entries.some((entry) => entry.id === entryId));
  const conditional = await client.getBuildExport({ etag: first.etag });
  assert.deepEqual(conditional, { changed: false, etag: first.etag });
  assert.ok(requests.every((path) => !path.includes("/build-media/")));
}
