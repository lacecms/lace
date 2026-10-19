import { expect, test } from "vitest";
import { CompleteImageContainerInspector, detectMediaMimeType } from "../dist/index.js";

const inspector = new CompleteImageContainerInspector();
const ascii = (value) => [...value].map((character) => character.charCodeAt(0));
const u16 = (value) => [value & 0xff, value >>> 8];
const table = [0, 0, 0, 255, 255, 255];

/** One frame with a local or no color table and a minimal LZW payload. */
function frame({ left = 0, top = 0, width = 1, height = 1, local = false, codeSize = 2 } = {}) {
  return [
    0x2c,
    ...u16(left),
    ...u16(top),
    ...u16(width),
    ...u16(height),
    local ? 0x80 : 0x00,
    ...(local ? table : []),
    codeSize,
    0x02,
    0x44,
    0x01,
    0x00,
  ];
}

const control = [0x21, 0xf9, 0x04, 0x04, 0x0a, 0x00, 0x00, 0x00];
const loop = [0x21, 0xff, 0x0b, ...ascii("NETSCAPE2.0"), 0x03, 0x01, 0x00, 0x00, 0x00];

function gif({ version = "GIF89a", width = 1, height = 1, global = true, body = [frame()] } = {}) {
  return new Uint8Array([
    ...ascii(version),
    ...u16(width),
    ...u16(height),
    global ? 0x80 : 0x00,
    0,
    0,
    ...(global ? table : []),
    ...body.flat(),
  ]);
}

const staticGif87a = gif({
  body: [frame(), 0x3b],
  global: false,
  height: 2,
  version: "GIF87a",
  width: 3,
});
const animatedGif89a = gif({
  body: [
    loop,
    control,
    frame({ height: 240, width: 320 }),
    control,
    frame({ height: 16, left: 10, local: true, top: 20, width: 16 }),
    control,
    frame({ height: 8, left: 300, top: 232, width: 20 }),
    0x3b,
  ],
  height: 240,
  width: 320,
});

test("detects GIF87a and GIF89a signatures only", () => {
  expect(detectMediaMimeType(staticGif87a)).toBe("image/gif");
  expect(detectMediaMimeType(animatedGif89a)).toBe("image/gif");
  for (const bytes of [ascii("GIF8"), ascii("GIF88a"), ascii("GIF89b")]) {
    expect(() => detectMediaMimeType(new Uint8Array(bytes))).toThrow(
      "Media upload is not an allowed image format.",
    );
  }
});

test("reports the logical screen of static and animated GIFs", async () => {
  await expect(inspector.inspect(staticGif87a, "image/gif")).resolves.toEqual({
    height: 2,
    width: 3,
  });
  await expect(inspector.inspect(animatedGif89a, "image/gif")).resolves.toEqual({
    height: 240,
    width: 320,
  });
});

test.each([
  ["a missing trailer", animatedGif89a.slice(0, -1)],
  ["trailing bytes", new Uint8Array([...animatedGif89a, 0x00])],
  ["a frame outside the logical screen", gif({ body: [frame({ left: 1 }), 0x3b] })],
  ["a frame taller than the logical screen", gif({ body: [frame({ height: 2 }), 0x3b] })],
  ["no image descriptor", gif({ body: [control, 0x3b] })],
  ["an LZW code size of 12", gif({ body: [frame({ codeSize: 12 }), 0x3b] })],
  ["an empty logical screen", gif({ body: [0x3b], height: 0, width: 0 })],
  ["an unknown block", gif({ body: [frame(), 0x00, 0x3b] })],
  ["a truncated color table", animatedGif89a.slice(0, 15)],
  ["an unterminated sub-block chain", gif({ body: [0x21, 0xfe, 0x05, 0x41] })],
])("rejects a GIF with %s", async (_name, bytes) => {
  await expect(inspector.inspect(bytes, "image/gif")).rejects.toMatchObject({
    code: "CONTENT_INVALID_STATE",
  });
});

test("rejects GIF bytes declared as another format and PNG bytes declared as GIF", async () => {
  await expect(inspector.inspect(animatedGif89a, "image/png")).rejects.toMatchObject({
    code: "CONTENT_INVALID_STATE",
  });
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
  await expect(inspector.inspect(png, "image/gif")).rejects.toMatchObject({
    code: "CONTENT_INVALID_STATE",
  });
});
