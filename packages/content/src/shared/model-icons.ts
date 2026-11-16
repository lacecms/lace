import emojiRegex from "emoji-regex";

export const MODEL_ICON_NAMES = Object.freeze([
  "book-open",
  "calendar-days",
  "file-text",
  "globe",
  "house",
  "images",
  "layers",
  "menu",
  "newspaper",
  "settings",
  "tags",
  "users",
] as const);

const modelIconNames: ReadonlySet<string> = new Set(MODEL_ICON_NAMES);
export const MAX_MODEL_ICON_LENGTH = 64;

export function isModelIconName(value: string): value is (typeof MODEL_ICON_NAMES)[number] {
  return modelIconNames.has(value);
}

export function isModelIconIdentifier(value: string): boolean {
  return value.length <= MAX_MODEL_ICON_LENGTH && /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u.test(value);
}

export function isModelIconEmoji(value: string): boolean {
  return value.length <= MAX_MODEL_ICON_LENGTH && emojiRegex().exec(value)?.[0] === value;
}
