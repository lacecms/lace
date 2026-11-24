import assert from "node:assert/strict";
import { createHash } from "node:crypto";

/** Generates the same kind of bounded derivative as the CMS for fixture originals. */
export function fixtureThumbnail(sharp, bytes) {
  return sharp(bytes, { pages: 1 })
    .autoOrient()
    .resize({ width: 320, height: 320, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 76 })
    .toBuffer();
}

/** Records status and byte counts so cold and conditional served-build reads can be compared. */
export function serveBuildThumbnail(
  request,
  response,
  { basePath = "", token, thumbnails, requests },
) {
  const prefix = `${basePath}/api/v1/public/build-media/`;
  if (!request.url?.startsWith(prefix)) return false;
  const id = /^([\w-]+)\/thumbnail$/u.exec(request.url.slice(prefix.length))?.[1];
  const body = thumbnails.get(id);
  const validator = request.headers["if-none-match"];
  const authorized = request.headers.authorization === `Bearer ${token}`;
  const etag =
    body === undefined ? undefined : `"t-${createHash("sha256").update(body).digest("hex")}"`;
  const status = !authorized ? 401 : body === undefined ? 404 : validator === etag ? 304 : 200;
  requests.push({ id, authorized, status, bytes: status === 200 ? body.length : 0 });
  response.writeHead(
    status,
    etag === undefined || !authorized
      ? { "cache-control": "no-store" }
      : {
          "cache-control": "private, no-cache",
          "content-type": "image/webp",
          etag,
        },
  );
  response.end(status === 200 ? body : undefined);
  return true;
}

export function assertBuildThumbnailReads(requests, expected) {
  assert.deepEqual(Object.fromEntries(requests.map(({ id, status }) => [id, status])), expected);
  assert.equal(
    requests.length,
    Object.keys(expected).length,
    "one thumbnail request per rendered media",
  );
  assert.ok(
    requests.every(({ authorized }) => authorized),
    "the SDK authenticates every thumbnail read",
  );
}
