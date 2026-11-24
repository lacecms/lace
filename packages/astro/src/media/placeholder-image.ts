/** An SVG data URL that draws a small WebP blurred to its full box. */
export function blurredPlaceholder(webp: Uint8Array, width: number, height: number): string {
  const deviation = Math.max(1, Math.round((width / 24) * 10) / 10);
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ${width} ${height}'>` +
    `<filter id='b' color-interpolation-filters='sRGB'><feGaussianBlur stdDeviation='${deviation}'/>` +
    "<feComponentTransfer><feFuncA type='discrete' tableValues='1 1'/></feComponentTransfer></filter>" +
    "<image width='100%' height='100%' preserveAspectRatio='none' filter='url(#b)' " +
    `href='data:image/webp;base64,${Buffer.from(webp).toString("base64")}'/></svg>`;
  // Percent-encode only what a CSS url() data URL needs; `%` goes first.
  let escaped = svg;
  for (const character of ["%", "\u0023", "<", ">"])
    escaped = escaped.replaceAll(character, encodeURIComponent(character));
  return `data:image/svg+xml,${escaped}`;
}
interface Dimensions {
  readonly width: number;
  readonly height: number;
}

/** Inspects the complete WebP container before passing a single opaque frame to the decoder. */
export function opaqueWebpDimensions(bytes: Uint8Array): Dimensions | undefined {
  if (bytes.length < 20) return undefined;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const fourCC = (offset: number) => String.fromCharCode(...bytes.subarray(offset, offset + 4));
  if (fourCC(0) !== "RIFF" || fourCC(8) !== "WEBP" || view.getUint32(4, true) !== bytes.length - 8)
    return undefined;

  let canvas: Dimensions | undefined;
  let frame: Dimensions | undefined;
  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const type = fourCC(offset);
    const size = view.getUint32(offset + 4, true);
    const start = offset + 8;
    const next = start + size + (size % 2);
    if (next > bytes.length) return undefined;
    switch (type) {
      case "VP8X": {
        if (offset !== 12 || size !== 10 || (bytes[start]! & 0x12) !== 0) return undefined;
        const u24 = (position: number) =>
          view.getUint16(position, true) + bytes[position + 2]! * 65536;
        canvas = { width: u24(start + 4) + 1, height: u24(start + 7) + 1 };
        break;
      }
      case "VP8 ":
        if (
          frame ||
          size <= 10 ||
          (bytes[start]! & 1) !== 0 ||
          bytes[start + 3] !== 0x9d ||
          view.getUint16(start + 4, true) !== 0x2a01
        )
          return undefined;
        frame = {
          width: view.getUint16(start + 6, true) & 0x3fff,
          height: view.getUint16(start + 8, true) & 0x3fff,
        };
        break;
      case "VP8L": {
        if (frame || size <= 5 || bytes[start] !== 0x2f) return undefined;
        const bits = view.getUint32(start + 1, true);
        if (bits >>> 28 !== 0) return undefined;
        frame = { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
        break;
      }
      case "ALPH":
      case "ANIM":
      case "ANMF":
        return undefined;
      default:
        if (offset === 12) return undefined;
    }
    offset = next;
  }
  if (offset !== bytes.length || !frame || frame.width === 0 || frame.height === 0)
    return undefined;
  if (canvas && (canvas.width !== frame.width || canvas.height !== frame.height)) return undefined;
  return frame;
}
