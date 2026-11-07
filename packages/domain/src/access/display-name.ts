/** Maximum characters of a trimmed account display name. */
export const MAX_DISPLAY_NAME_LENGTH = 120;

// oxlint-disable-next-line no-control-regex -- rejects control characters by design.
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f-\u009f]/u;

/** Trims a display name and enforces the shared bounds. */
export function normalizeDisplayName(value: string): string {
  const name = value.trim();
  if (name.length < 1 || name.length > MAX_DISPLAY_NAME_LENGTH || CONTROL_CHARACTERS.test(name))
    throw new TypeError("Invalid display name.");
  return name;
}
