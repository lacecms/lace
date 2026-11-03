/** Folds only ASCII letters, matching SQLite `lower()` so every adapter searches alike. */
export function foldAscii(value: string): string {
  return value.replace(/[A-Z]/gu, (letter) => letter.toLowerCase());
}
