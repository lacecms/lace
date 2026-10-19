import { expect, test } from "vitest";
import sharp from "sharp";
import { animatedGifFixture } from "@lacecms/test-utils";
import { NodeSharpImageInspector } from "../dist/index.js";

const inspector = new NodeSharpImageInspector();
const fixtures = [
  ["image/png", "png"],
  ["image/jpeg", "jpeg"],
  ["image/webp", "webp"],
  ["image/avif", "avif"],
  ["image/gif", "gif"],
];

async function image(format) {
  return sharp({ create: { width: 3, height: 2, channels: 3, background: { r: 1, g: 2, b: 3 } } })
    [format]()
    .toBuffer();
}

test.each(fixtures)("valid %s retains displayed dimensions", async (mimeType, format) => {
  await expect(inspector.inspect(await image(format), mimeType)).resolves.toEqual({
    width: 3,
    height: 2,
  });
});

test.each(fixtures)("%s rejects executable trailing bytes", async (mimeType, format) => {
  const bytes = Buffer.concat([await image(format), Buffer.from("<script>untrusted()</script>")]);
  await expect(inspector.inspect(bytes, mimeType)).rejects.toMatchObject({
    code: "CONTENT_INVALID_STATE",
  });
});

test("an animated GIF retains its logical-screen dimensions", async () => {
  await expect(inspector.inspect(animatedGifFixture(), "image/gif")).resolves.toEqual({
    height: 240,
    width: 320,
  });
});

test("PNG bytes declared as GIF are rejected", async () => {
  await expect(inspector.inspect(await image("png"), "image/gif")).rejects.toMatchObject({
    code: "CONTENT_INVALID_STATE",
  });
});
