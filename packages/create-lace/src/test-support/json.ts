export function object(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    throw new Error("Expected JSON object");
  return Object.fromEntries(Object.entries(value));
}

export function parsedObject(text: string): Record<string, unknown> {
  return object(JSON.parse(text) as unknown);
}
