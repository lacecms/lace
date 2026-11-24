import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(
  new URL("../../packages/platform-node/package.json", import.meta.url),
);
const sharp = require("sharp");

function noise(width, height) {
  const bytes = Buffer.allocUnsafe(width * height * 3);
  let state = 47;
  for (let offset = 0; offset < bytes.length; offset++) {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    bytes[offset] = state & 255;
  }
  return sharp(bytes, { raw: { width, height, channels: 3 } });
}

function animatedGif(width, height, frames) {
  const bytes = Buffer.alloc(width * height * 3 * frames);
  const frameSize = width * height * 3;
  for (let frame = 0; frame < frames; frame++) {
    const color = frame % 2 === 0 ? Buffer.from([225, 20, 30]) : Buffer.from([20, 70, 225]);
    bytes.fill(color, frame * frameSize, (frame + 1) * frameSize);
  }
  return sharp(bytes, { raw: { width, height: height * frames, channels: 3, pageHeight: height } })
    .gif({ dither: 0, delay: 450, keepDuplicateFrames: true })
    .toBuffer();
}

export async function thumbnailSources() {
  const [jpeg, png, oriented, transparent, gif, largeGif, avif] = await Promise.all([
    noise(5200, 3600).jpeg({ quality: 45 }).toBuffer(),
    noise(2100, 1300).png().toBuffer(),
    noise(900, 600).withMetadata({ orientation: 6 }).jpeg().toBuffer(),
    sharp({
      create: { width: 550, height: 370, channels: 4, background: "#4080c080" },
    })
      .png()
      .toBuffer(),
    animatedGif(480, 320, 2),
    animatedGif(2048, 1536, 36),
    sharp({ create: { width: 600, height: 400, channels: 3, background: "#401080" } })
      .avif()
      .toBuffer(),
  ]);
  return [
    { name: "mp1-heavy.jpg", type: "image/jpeg", bytes: jpeg },
    { name: "mp1-heavy.png", type: "image/png", bytes: png },
    { name: "mp1-legacy-oriented.jpg", type: "image/jpeg", bytes: oriented },
    { name: "mp1-transparent.png", type: "image/png", bytes: transparent },
    { name: "mp1-avif.avif", type: "image/avif", bytes: avif },
    { name: "mp1-animation.gif", type: "image/gif", bytes: gif },
    { name: "mp1-large-animation.gif", type: "image/gif", bytes: largeGif },
  ];
}

export async function seedThumbnailMedia(fixture, { removeHash, resetUploadRate }) {
  const sources = await thumbnailSources();
  const small = {
    type: "image/jpeg",
    bytes: await noise(640, 480).jpeg().toBuffer(),
  };
  const count = 120;
  const fillers = Array.from({ length: count - sources.length }, (_, index) => ({
    ...small,
    name: `mp1-${String(index).padStart(3, "0")}.jpg`,
  }));
  for (const [index, { name, type, bytes }] of [...fillers, ...sources].entries()) {
    if (index > 0 && index % 24 === 0) await resetUploadRate();
    assert.ok(bytes.length < 10 * 1024 * 1024, name);
    const form = new FormData();
    form.append("file", new Blob([bytes], { type }), name);
    const response = await fixture.call("/api/v1/admin/media", {
      method: "POST",
      body: form,
      cookie: fixture.cookies.admin,
    });
    assert.equal(response.status, 201, `Upload ${name}: ${await response.clone().text()}`);
    if (name === "mp1-legacy-oriented.jpg") await removeHash((await response.json()).id);
  }
  return count;
}

/** Deterministic offline implementation of the Images binding used by local Worker tests. */
export async function transformFixtureImage(stream, dimensions, options) {
  assert.equal(dimensions.fit, "scale-down");
  assert.equal(options.format, "image/webp");
  assert.equal(options.anim, false);
  const input = new Uint8Array(await new Response(stream).arrayBuffer());
  const thumbnail = await sharp(input, { pages: 1 })
    .autoOrient()
    .resize({
      width: dimensions.width,
      height: dimensions.height,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality: options.quality })
    .toBuffer();
  return {
    response: () =>
      new Response(new Uint8Array(thumbnail), {
        headers: { "content-type": "image/webp" },
      }),
  };
}

export function fixtureImagesBinding(output = transformFixtureImage) {
  return {
    input: (stream) => ({
      transform: (dimensions) => ({ output: (options) => output(stream, dimensions, options) }),
    }),
  };
}
