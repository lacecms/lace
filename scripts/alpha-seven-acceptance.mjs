import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { gifFixture } from "../packages/test-utils/dist/index.js";

/** Three visibly different frames prevent encoders coalescing identical frames. */
export function alphaSevenGif() {
  const bytes = Buffer.from(
    gifFixture({
      width: 320,
      height: 240,
      frames: [
        { width: 320, height: 240 },
        { width: 320, height: 240, localColorTable: true },
        { width: 320, height: 240 },
      ],
    }),
  );
  const descriptor = Buffer.from([0x2c, 0, 0, 0, 0, 0x40, 1, 0xf0, 0, 0x81]);
  const offset = bytes.indexOf(descriptor);
  assert.ok(offset > 0);
  bytes.set([0, 255, 0, 255, 255, 0, 255, 0, 255, 0, 255, 255], offset + descriptor.length);
  return bytes;
}

/** Real media HTTP probes shared by the saved Node and Worker consumers. */
export async function alphaSevenMediaJourney({ base, cookie, project, proxyBase }) {
  const invoke = async (path, { json, ...options } = {}) => {
    const response = await fetch(new URL(`api/v1/${path}`, base), {
      ...options,
      headers: {
        cookie,
        origin: new URL(base).origin,
        ...(json === undefined ? {} : { "content-type": "application/json" }),
        ...options.headers,
      },
      ...(json === undefined ? {} : { body: JSON.stringify(json) }),
      signal: AbortSignal.timeout(30_000),
    });
    const body = response.status === 204 ? undefined : await response.json();
    assert.ok(response.ok, `${path}: ${response.status} ${JSON.stringify(body)}`);
    return { response, body };
  };
  const gif = alphaSevenGif();
  const form = new FormData();
  form.append("file", new Blob([gif], { type: "image/gif" }), "alpha-seven.gif");
  const uploaded = await invoke("admin/media", { method: "POST", body: form });
  assert.equal(uploaded.response.status, 201);
  assert.equal(uploaded.body.mimeType, "image/gif");
  assert.equal(uploaded.body.width, 320);
  assert.equal(uploaded.body.height, 240);
  const id = uploaded.body.id;
  const preview = await fetch(new URL(`api/v1/admin/media/${id}/preview`, base), {
    headers: { cookie },
  });
  assert.equal(preview.status, 200);
  assert.deepEqual(Buffer.from(await preview.arrayBuffer()), gif);
  assert.equal(preview.headers.get("cache-control"), "private, no-cache");
  const tag = preview.headers.get("etag");
  assert.ok(tag);
  const privateConditional = await fetch(new URL(`api/v1/admin/media/${id}/preview`, base), {
    headers: { cookie, "if-none-match": tag },
  });
  assert.equal(privateConditional.status, 304);
  assert.equal(await privateConditional.text(), "");
  const created = await invoke("admin/models/posts/entries", {
    method: "POST",
    json: {
      title: "Alpha seven GIF",
      slug: "alpha-seven-gif",
      fields: {},
      blocks: [
        {
          key: `01J${"701".padStart(23, "0")}`,
          type: "image",
          schemaVersion: 4,
          position: 1024,
          data: { media: id },
        },
      ],
    },
  });
  const entry = created.body.id;
  const published = await invoke(`admin/entries/${entry}/publish`, {
    method: "POST",
    json: { expectedRevision: 1 },
  });
  const publicUrl = new URL(`api/v1/public/media/${id}`, base);
  const original = await fetch(publicUrl);
  assert.equal(original.status, 200);
  assert.equal(original.headers.get("content-type"), "image/gif");
  assert.equal(original.headers.get("cache-control"), "public, max-age=86400");
  assert.deepEqual(Buffer.from(await original.arrayBuffer()), gif);
  for (const value of [tag, `W/${tag}`]) {
    const conditional = await fetch(publicUrl, { headers: { "if-none-match": value } });
    assert.equal(conditional.status, 304);
    assert.equal(conditional.headers.get("etag"), tag);
    assert.equal(await conditional.text(), "");
  }
  await invoke(`admin/entries/${entry}/unpublish`, {
    method: "POST",
    json: { expectedPublishedSnapshotId: published.body.entry.published.id },
  });
  const current = await invoke(`admin/entries/${entry}`);
  await invoke(`admin/entries/${entry}`, {
    method: "DELETE",
    json: { expectedRevision: current.body.draft.revision },
  });
  await invoke(`admin/media/${id}`, { method: "DELETE" });
  assert.equal((await fetch(publicUrl, { headers: { "if-none-match": tag } })).status, 404);

  if (proxyBase) {
    // Decode/encode with the installed site's dependency, never source runtime code.
    const sharp = createRequire(join(project, "site/package.json"))("sharp");
    const png = await sharp(randomBytes(1024 * 512 * 3), {
      raw: { width: 1024, height: 512, channels: 3 },
    })
      .png()
      .toBuffer();
    assert.ok(png.length > 1024 * 1024 && png.length < 10 * 1024 * 1024);
    const large = new FormData();
    large.append("file", new Blob([png], { type: "image/png" }), "alpha-seven-large.png");
    const response = await fetch(new URL("api/v1/admin/media", proxyBase), {
      method: "POST",
      headers: { cookie, origin: new URL(base).origin },
      body: large,
      signal: AbortSignal.timeout(30_000),
    });
    assert.equal(response.status, 201, await response.clone().text());
    await invoke(`admin/media/${(await response.json()).id}`, { method: "DELETE" });
    const page = await fetch(new URL("blog/acceptance/", proxyBase));
    assert.equal(page.status, 200);
    assert.equal(page.headers.get("cache-control"), "no-cache");
    const html = await page.text();
    const asset = html.match(/(?:src|href)="(\/_astro\/[^" ]+)"/u)?.[1];
    assert.ok(asset, "served release has no hashed asset");
    const cached = await fetch(new URL(asset, proxyBase));
    assert.equal(cached.status, 200);
    assert.equal(cached.headers.get("cache-control"), "public, max-age=2592000, immutable");
    await cached.arrayBuffer();
    for (const path of ["_astro/alpha-seven-missing.webp", "_headers"]) {
      const missing = await fetch(new URL(path, proxyBase));
      assert.equal(missing.status, 404);
      assert.ok(!missing.headers.get("cache-control")?.includes("immutable"));
      await missing.arrayBuffer();
    }
  }
  console.info(
    `Alpha seven exact consumer: GIF/original/validators${proxyBase ? ", large proxy upload and static cache headers" : " in local Worker/R2"} passed`,
  );
}

/** Inspect the output bytes from the installed starter's image regression build. */
export async function verifyAlphaSevenImages(project, html) {
  const sharp = createRequire(join(project, "site/package.json"))("sharp");
  const figure = (key) => {
    const value = html.match(
      new RegExp(`<figure[^>]*data-lace-block-key="${key}"[^>]*>([\\s\\S]*?)</figure>`, "u"),
    )?.[1];
    assert.ok(value, `missing image figure ${key}`);
    return value;
  };
  const photo = figure("alpha-seven-photo");
  assert.ok(photo.includes("data:image/svg+xml,"));
  assert.ok(photo.includes("<dialog"));
  const transparent = figure("alpha-seven-transparent");
  assert.ok(!transparent.includes("background-image"));
  const animated = figure("alpha-seven-gif");
  assert.ok(!animated.includes("background-image"));
  assert.ok(animated.includes('href="/image-destination"'));
  assert.ok(!animated.includes("<dialog"), "link did not take precedence over lightbox");
  const source = animated.match(/\ssrc="([^" ]+\.webp)"/u)?.[1];
  assert.ok(source);
  const bytes = await readFile(join(project, "site/dist", source));
  const metadata = await sharp(bytes, { animated: true }).metadata();
  assert.equal(metadata.format, "webp");
  assert.equal(metadata.pages, 3, "GIF frame count was not preserved");
  assert.equal(metadata.width, 320);
  assert.equal(metadata.pageHeight, 240);
  assert.ok(photo.includes("960w") && photo.includes("1920w"));
  const gallery = html.match(
    /<section[^>]*data-lace-block-key="alpha-seven-gallery"[^>]*>([\s\S]*?)<\/section>/u,
  )?.[1];
  assert.ok(gallery?.includes('href="/gallery-destination"'));
  assert.equal(
    gallery.match(/<dialog\b/gu)?.length,
    1,
    "only the unlinked gallery item opens a lightbox",
  );
  assert.equal(
    (await readFile(join(project, "site/dist/_headers"), "utf8")).includes(
      "max-age=2592000, immutable",
    ),
    true,
  );
}
