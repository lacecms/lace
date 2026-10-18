import { expect, test } from "vitest";
import sharp from "sharp";
import { animatedGifFixture, gifFixture } from "@lacecms/test-utils";
import { WorkerImageInspector } from "../dist/index.js";

const inspector = new WorkerImageInspector();

function base(width, height) {
  return sharp({ create: { background: { b: 3, g: 2, r: 1 }, channels: 3, height, width } });
}

async function sharpDimensions(bytes) {
  const metadata = await sharp(bytes).metadata();
  return metadata.autoOrient;
}

const cases = [
  ["image/png", () => base(3, 2).png().toBuffer()],
  ["image/png", () => base(400, 200).png().withMetadata({ orientation: 6 }).toBuffer()],
  ["image/jpeg", () => base(3, 2).jpeg().toBuffer()],
  ["image/jpeg", () => base(400, 200).jpeg({ progressive: true }).toBuffer()],
  ["image/jpeg", () => base(400, 200).jpeg().withMetadata({ orientation: 6 }).toBuffer()],
  ["image/jpeg", () => base(400, 200).jpeg().withMetadata({ orientation: 3 }).toBuffer()],
  ["image/webp", () => base(3, 2).webp().toBuffer()],
  ["image/webp", () => base(301, 17).webp({ lossless: true }).toBuffer()],
  ["image/webp", () => base(400, 200).webp().withMetadata({ orientation: 8 }).toBuffer()],
  ["image/avif", () => base(64, 32).avif().toBuffer()],
  ["image/gif", () => base(5, 4).gif().toBuffer()],
  ["image/gif", async () => animatedGifFixture()],
];

test.each(cases.map(([type, make], index) => [index, type, make]))(
  "fixture %i (%s) reports the same displayed dimensions as sharp",
  async (_index, type, make) => {
    const bytes = new Uint8Array(await make());
    const expected = await sharpDimensions(bytes);
    await expect(inspector.inspect(bytes, type)).resolves.toEqual({
      height: expected.height,
      width: expected.width,
    });
  },
);

test("a 400x200 JPEG with EXIF orientation 6 displays as 200x400", async () => {
  const bytes = new Uint8Array(
    await base(400, 200).jpeg().withMetadata({ orientation: 6 }).toBuffer(),
  );
  await expect(inspector.inspect(bytes, "image/jpeg")).resolves.toEqual({
    height: 400,
    width: 200,
  });
});

test("rejects mismatched, truncated, trailing, and corrupted images", async () => {
  const fixtures = {
    "image/avif": new Uint8Array(await base(8, 8).avif().toBuffer()),
    "image/gif": animatedGifFixture(),
    "image/jpeg": new Uint8Array(await base(8, 8).jpeg().toBuffer()),
    "image/png": new Uint8Array(await base(8, 8).png().toBuffer()),
    "image/webp": new Uint8Array(await base(8, 8).webp().toBuffer()),
  };
  const rejected = (bytes, type) =>
    expect(inspector.inspect(bytes, type)).rejects.toMatchObject({
      code: "CONTENT_INVALID_STATE",
    });
  for (const [type, bytes] of Object.entries(fixtures)) {
    await rejected(new Uint8Array([...bytes, 0]), type);
    await rejected(bytes.slice(0, bytes.length - 1), type);
    await rejected(bytes.slice(0, Math.floor(bytes.length / 2)), type);
    await rejected(new Uint8Array(0), type);
    for (const [other] of Object.entries(fixtures))
      if (other !== type) await rejected(bytes, other);
  }
  const png = fixtures["image/png"].slice();
  png[20] ^= 0xff;
  await rejected(png, "image/png");
  const webp = fixtures["image/webp"].slice();
  webp[4] ^= 0x01;
  await rejected(webp, "image/webp");
});

test("an animated GIF reports its logical screen", async () => {
  await expect(inspector.inspect(animatedGifFixture(), "image/gif")).resolves.toEqual({
    height: 240,
    width: 320,
  });
});

test.each([
  [
    "a frame outside the logical screen",
    { frames: [{ height: 2, left: 2, width: 2 }], height: 2, width: 3 },
  ],
  ["no image descriptor", { frames: [], height: 2, width: 3 }],
  [
    "an LZW code size of 12",
    { frames: [{ codeSize: 12, height: 2, width: 3 }], height: 2, width: 3 },
  ],
  ["a missing trailer", { frames: [{ height: 2, width: 3 }], height: 2, trailer: false, width: 3 }],
])("rejects a GIF with %s", async (_name, fixture) => {
  await expect(inspector.inspect(gifFixture(fixture), "image/gif")).rejects.toMatchObject({
    code: "CONTENT_INVALID_STATE",
  });
});
