/** The maximum number of internal URL occurrences in a normalized snapshot. */
export const MAX_INTERNAL_LINK_REFERENCES = 200;

/** C0 controls, DEL and C1 controls. */
function isControlCharacter(character: string): boolean {
  const code = character.codePointAt(0) ?? 0;
  return code <= 0x1f || (code >= 0x7f && code <= 0x9f);
}

/** Entry IDs are opaque strings, bounded by the shared identifier contract. */
export function isInternalLinkTargetId(value: unknown): value is string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > 255 ||
    [...value].some(isControlCharacter)
  )
    return false;
  try {
    encodeURIComponent(value);
    return true;
  } catch {
    return false;
  }
}

/** Encode one opaque entry ID, without a route, query or fragment. */
export function encodeEntryLink(id: string): string {
  if (!isInternalLinkTargetId(id)) throw new TypeError("Invalid internal link target ID.");
  return `entry:${encodeURIComponent(id)}`;
}

/** Decode only canonical tokens; manual URLs and malformed tokens return undefined. */
export function decodeEntryLink(value: unknown): string | undefined {
  if (typeof value !== "string" || !value.startsWith("entry:")) return undefined;
  try {
    const id = decodeURIComponent(value.slice(6));
    return isInternalLinkTargetId(id) && encodeEntryLink(id) === value ? id : undefined;
  } catch {
    return undefined;
  }
}
