export interface GifFrameFixture {
  readonly codeSize?: number;
  readonly height: number;
  readonly left?: number;
  readonly localColorTable?: boolean;
  readonly top?: number;
  readonly width: number;
}

export interface GifFixture {
  readonly frames: readonly GifFrameFixture[];
  readonly globalColorTable?: boolean;
  readonly height: number;
  readonly trailer?: boolean;
  readonly trailing?: readonly number[];
  readonly version?: "GIF87a" | "GIF89a";
  readonly width: number;
}

function ascii(value: string): number[] {
  return [...value].map((character) => character.charCodeAt(0));
}

function u16(value: number): number[] {
  return [value & 0xff, (value >>> 8) & 0xff];
}

/** Four-color table: black, white, red, blue. */
const colorTable = [0, 0, 0, 255, 255, 255, 255, 0, 0, 0, 0, 255];

/**
 * Valid LZW data for a frame: a clear code before every pixel keeps the code
 * width at `codeSize + 1` bits, so any decoder accepts it without a dictionary.
 */
function lzwData(pixels: number, codeSize: number): number[] {
  const clear = 1 << codeSize;
  const width = codeSize + 1;
  const codes: number[] = [];
  for (let index = 0; index < pixels; index += 1) codes.push(clear, index % 4);
  codes.push(clear + 1);
  const bytes: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const code of codes) {
    buffer |= code << bits;
    bits += width;
    while (bits >= 8) {
      bytes.push(buffer & 0xff);
      buffer >>>= 8;
      bits -= 8;
    }
  }
  if (bits > 0) bytes.push(buffer & 0xff);
  const blocks: number[] = [];
  for (let offset = 0; offset < bytes.length; offset += 255) {
    const chunk = bytes.slice(offset, offset + 255);
    blocks.push(chunk.length, ...chunk);
  }
  blocks.push(0);
  return blocks;
}

/**
 * Builds GIF bytes with real, decodable frames for media tests. Every frame
 * repeats a graphic control extension, so a GIF89a with several frames is an
 * animation; GIF87a output carries no extensions.
 */
export function gifFixture(fixture: GifFixture): Uint8Array {
  const version = fixture.version ?? "GIF89a";
  const global = fixture.globalColorTable ?? true;
  const bytes: number[] = ascii(version);
  bytes.push(...u16(fixture.width), ...u16(fixture.height), global ? 0x81 : 0x00, 0, 0);
  if (global) bytes.push(...colorTable);
  if (version === "GIF89a" && fixture.frames.length > 1) {
    // NETSCAPE2.0 application extension: loop forever.
    bytes.push(0x21, 0xff, 0x0b, ...ascii("NETSCAPE2.0"), 3, 1, 0, 0, 0);
  }
  for (const frame of fixture.frames) {
    if (version === "GIF89a") bytes.push(0x21, 0xf9, 4, 0x04, ...u16(10), 0, 0);
    const local = frame.localColorTable ?? false;
    bytes.push(
      0x2c,
      ...u16(frame.left ?? 0),
      ...u16(frame.top ?? 0),
      ...u16(frame.width),
      ...u16(frame.height),
      local ? 0x81 : 0x00,
    );
    if (local) bytes.push(...colorTable);
    const codeSize = frame.codeSize ?? 2;
    bytes.push(codeSize, ...lzwData(frame.width * frame.height, Math.min(codeSize, 8)));
  }
  if (fixture.trailer ?? true) bytes.push(0x3b);
  bytes.push(...(fixture.trailing ?? []));
  return new Uint8Array(bytes);
}

/** A 320x240 GIF89a animation with a global color table and three frames. */
export function animatedGifFixture(): Uint8Array {
  return gifFixture({
    frames: [
      { height: 240, width: 320 },
      { height: 16, left: 10, localColorTable: true, top: 20, width: 16 },
      { height: 8, left: 300, top: 200, width: 20 },
    ],
    height: 240,
    width: 320,
  });
}
