import type { ImageDimensions, ImageInspector, MediaMimeType } from "./index.js";
import { DomainError } from "@lacecms/domain";

class InvalidImage extends Error {}

function invalid(): never {
  throw new InvalidImage();
}

function need(condition: boolean): asserts condition {
  if (!condition) invalid();
}

/** Bounds-checked big- and little-endian reads over one immutable byte sequence. */
class Bytes {
  private readonly view: DataView;

  public constructor(readonly data: Uint8Array) {
    this.view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  }

  public get length(): number {
    return this.data.byteLength;
  }

  public ascii(offset: number, length: number): string {
    this.check(offset, length);
    return String.fromCharCode(...this.data.subarray(offset, offset + length));
  }

  public u8(offset: number): number {
    this.check(offset, 1);
    return this.data[offset]!;
  }

  public u16(offset: number, little = false): number {
    this.check(offset, 2);
    return this.view.getUint16(offset, little);
  }

  public u24le(offset: number): number {
    this.check(offset, 3);
    return this.data[offset]! | (this.data[offset + 1]! << 8) | (this.data[offset + 2]! << 16);
  }

  public u32(offset: number, little = false): number {
    this.check(offset, 4);
    return this.view.getUint32(offset, little);
  }

  public slice(offset: number, length: number): Bytes {
    this.check(offset, length);
    return new Bytes(this.data.subarray(offset, offset + length));
  }

  private check(offset: number, length: number): void {
    need(Number.isSafeInteger(offset) && offset >= 0 && length >= 0);
    need(offset + length <= this.data.byteLength);
  }
}

interface ParsedImage {
  readonly height: number;
  readonly orientation: number;
  readonly width: number;
}

/** Reads the TIFF orientation tag; unreadable metadata is ignored like an absent tag. */
function exifOrientation(tiff: Bytes): number {
  try {
    const order = tiff.ascii(0, 2);
    if (order !== "II" && order !== "MM") return 1;
    const little = order === "II";
    if (tiff.u16(2, little) !== 42) return 1;
    const directory = tiff.u32(4, little);
    const entries = tiff.u16(directory, little);
    for (let index = 0; index < entries; index += 1) {
      const entry = directory + 2 + index * 12;
      if (tiff.u16(entry, little) !== 0x0112) continue;
      const value = tiff.u16(entry + 8, little);
      return value >= 1 && value <= 8 ? value : 1;
    }
    return 1;
  } catch {
    return 1;
  }
}

function exifPayload(bytes: Bytes): Bytes {
  return bytes.length >= 6 && bytes.ascii(0, 6) === "Exif\0\0"
    ? bytes.slice(6, bytes.length - 6)
    : bytes;
}

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let value = 0; value < 256; value += 1) {
    let crc = value;
    for (let bit = 0; bit < 8; bit += 1) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
    table[value] = crc >>> 0;
  }
  return table;
})();

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (const value of data) crc = crcTable[(crc ^ value) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function parsePng(bytes: Bytes): ParsedImage {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  need(signature.every((value, index) => bytes.u8(index) === value));
  let offset = 8;
  let width = 0;
  let height = 0;
  let orientation = 1;
  let sawData = false;
  let first = true;
  for (;;) {
    const length = bytes.u32(offset);
    const type = bytes.ascii(offset + 4, 4);
    const chunk = bytes.slice(offset + 4, 4 + length);
    need(bytes.u32(offset + 8 + length) === crc32(chunk.data));
    const data = bytes.slice(offset + 8, length);
    if (first) {
      need(type === "IHDR" && length === 13);
      width = data.u32(0);
      height = data.u32(4);
      first = false;
    } else {
      need(type !== "IHDR");
    }
    if (type === "IDAT") sawData = true;
    if (type === "eXIf") orientation = exifOrientation(data);
    offset += 12 + length;
    if (type === "IEND") {
      need(length === 0 && offset === bytes.length);
      break;
    }
  }
  need(sawData);
  return { height, orientation, width };
}

function isStandaloneJpegMarker(marker: number): boolean {
  return marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7);
}

function isStartOfFrame(marker: number): boolean {
  return marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
}

function parseJpeg(bytes: Bytes): ParsedImage {
  need(bytes.u8(0) === 0xff && bytes.u8(1) === 0xd8);
  let offset = 2;
  let width = 0;
  let height = 0;
  let orientation = 1;
  let sawScan = false;
  for (;;) {
    need(bytes.u8(offset) === 0xff);
    while (bytes.u8(offset) === 0xff) offset += 1;
    const marker = bytes.u8(offset);
    offset += 1;
    if (marker === 0xd9) {
      need(offset === bytes.length);
      break;
    }
    need(marker !== 0x00 && marker !== 0xd8);
    if (isStandaloneJpegMarker(marker)) continue;
    const length = bytes.u16(offset);
    need(length >= 2);
    const segment = bytes.slice(offset + 2, length - 2);
    offset += length;
    if (isStartOfFrame(marker)) {
      need(width === 0 && segment.length >= 6);
      height = segment.u16(1);
      width = segment.u16(3);
    } else if (
      marker === 0xe1 &&
      segment.length >= 6 &&
      segment.ascii(0, 6) === "Exif\0\0" &&
      orientation === 1
    ) {
      orientation = exifOrientation(segment.slice(6, segment.length - 6));
    } else if (marker === 0xda) {
      need(width > 0);
      sawScan = true;
      // Entropy-coded data ends at the first marker other than a stuffed zero or restart.
      for (;;) {
        if (bytes.u8(offset) !== 0xff) {
          offset += 1;
          continue;
        }
        const next = bytes.u8(offset + 1);
        if (next === 0x00 || (next >= 0xd0 && next <= 0xd7)) {
          offset += 2;
          continue;
        }
        if (next === 0xff) {
          offset += 1;
          continue;
        }
        break;
      }
    }
  }
  need(sawScan);
  return { height, orientation, width };
}

function parseWebp(bytes: Bytes): ParsedImage {
  need(bytes.ascii(0, 4) === "RIFF" && bytes.ascii(8, 4) === "WEBP");
  need(bytes.u32(4, true) + 8 === bytes.length);
  let offset = 12;
  let width = 0;
  let height = 0;
  let orientation = 1;
  let extended = false;
  let sawImage = false;
  let first = true;
  while (offset < bytes.length) {
    const type = bytes.ascii(offset, 4);
    const length = bytes.u32(offset + 4, true);
    const data = bytes.slice(offset + 8, length);
    const padded = length + (length % 2);
    need(offset + 8 + padded <= bytes.length);
    if (type === "VP8 ") {
      need(data.u8(3) === 0x9d && data.u8(4) === 0x01 && data.u8(5) === 0x2a);
      if (!extended) {
        width = data.u16(6, true) & 0x3fff;
        height = data.u16(8, true) & 0x3fff;
      }
      sawImage = true;
    } else if (type === "VP8L") {
      need(data.u8(0) === 0x2f);
      const bits = data.u32(1, true);
      if (!extended) {
        width = (bits & 0x3fff) + 1;
        height = ((bits >>> 14) & 0x3fff) + 1;
      }
      sawImage = true;
    } else if (type === "VP8X") {
      need(first && length >= 10);
      extended = true;
      width = data.u24le(4) + 1;
      height = data.u24le(7) + 1;
    } else if (type === "ANIM") {
      need(extended);
      sawImage = true;
    } else if (type === "EXIF") {
      need(extended);
      orientation = exifOrientation(exifPayload(data));
    }
    need(!first || type === "VP8 " || type === "VP8L" || type === "VP8X");
    first = false;
    offset += 8 + padded;
  }
  need(offset === bytes.length && sawImage);
  return { height, orientation, width };
}

interface Box {
  readonly data: Bytes;
  readonly type: string;
}

/** Splits an ISOBMFF region into boxes that must tile it exactly. */
function boxes(region: Bytes): Box[] {
  const result: Box[] = [];
  let offset = 0;
  while (offset < region.length) {
    let size = region.u32(offset);
    const type = region.ascii(offset + 4, 4);
    let header = 8;
    if (size === 1) {
      const high = region.u32(offset + 8);
      need(high === 0);
      size = region.u32(offset + 12);
      header = 16;
    } else if (size === 0) {
      size = region.length - offset;
    }
    need(size >= header);
    result.push({ data: region.slice(offset + header, size - header), type });
    offset += size;
  }
  need(offset === region.length);
  return result;
}

function child(list: readonly Box[], type: string): Box | undefined {
  return list.find((box) => box.type === type);
}

function parseAvif(bytes: Bytes): ParsedImage {
  const top = boxes(bytes);
  const ftyp = top[0];
  need(ftyp?.type === "ftyp" && ["avif", "avis"].includes(ftyp.data.ascii(0, 4)));
  need(child(top, "mdat") !== undefined);
  const meta = child(top, "meta");
  need(meta !== undefined);
  const metaChildren = boxes(meta.data.slice(4, meta.data.length - 4));
  const pitm = child(metaChildren, "pitm");
  need(pitm !== undefined);
  const primary = pitm.data.u8(0) === 0 ? pitm.data.u16(4) : pitm.data.u32(4);
  const iprp = child(metaChildren, "iprp");
  need(iprp !== undefined);
  const iprpChildren = boxes(iprp.data);
  const ipco = child(iprpChildren, "ipco");
  const ipma = child(iprpChildren, "ipma");
  need(ipco !== undefined && ipma !== undefined);
  const properties = boxes(ipco.data);
  const version = ipma.data.u8(0);
  const wideIndex = (ipma.data.u8(3) & 1) === 1;
  let offset = 4;
  const count = ipma.data.u32(offset);
  offset += 4;
  const associated: number[] = [];
  for (let entry = 0; entry < count; entry += 1) {
    const item = version < 1 ? ipma.data.u16(offset) : ipma.data.u32(offset);
    offset += version < 1 ? 2 : 4;
    const associations = ipma.data.u8(offset);
    offset += 1;
    for (let index = 0; index < associations; index += 1) {
      const value = wideIndex ? ipma.data.u16(offset) & 0x7fff : ipma.data.u8(offset) & 0x7f;
      offset += wideIndex ? 2 : 1;
      if (item === primary) associated.push(value);
    }
  }
  need(offset === ipma.data.length);
  let width = 0;
  let height = 0;
  let rotation = 0;
  for (const index of associated) {
    need(index >= 1 && index <= properties.length);
    const property = properties[index - 1]!;
    if (property.type === "ispe") {
      width = property.data.u32(4);
      height = property.data.u32(8);
    } else if (property.type === "irot") {
      rotation = property.data.u8(0) & 0x03;
    }
  }
  // An `irot` of 90 or 270 degrees displays the image with swapped axes.
  return { height, orientation: rotation % 2 === 1 ? 6 : 1, width };
}

/**
 * Runtime-neutral complete image-container inspector. It validates each format's
 * complete container structure without decoding pixels and reports displayed
 * (orientation-applied) dimensions, matching the Node sharp inspector.
 */
export class CompleteImageContainerInspector implements ImageInspector {
  public async inspect(data: Uint8Array, mimeType: MediaMimeType): Promise<ImageDimensions> {
    try {
      const bytes = new Bytes(data);
      const parsed =
        mimeType === "image/png"
          ? parsePng(bytes)
          : mimeType === "image/jpeg"
            ? parseJpeg(bytes)
            : mimeType === "image/webp"
              ? parseWebp(bytes)
              : parseAvif(bytes);
      need(
        Number.isSafeInteger(parsed.width) &&
          Number.isSafeInteger(parsed.height) &&
          parsed.width >= 1 &&
          parsed.height >= 1,
      );
      return parsed.orientation >= 5
        ? { height: parsed.width, width: parsed.height }
        : { height: parsed.height, width: parsed.width };
    } catch {
      throw new DomainError("CONTENT_INVALID_STATE", "Media image data is invalid.");
    }
  }
}
