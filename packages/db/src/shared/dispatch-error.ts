export function sanitizeDispatchError(value: string): string {
  return (
    value
      .replace(/[\r\n\t]/gu, " ")
      .replace(/\s+/gu, " ")
      .trim()
      .slice(0, 160) || "storage_unavailable"
  );
}
