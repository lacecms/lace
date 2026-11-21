/** Read Wrangler JSONC while preserving comment-like text inside quoted values. */
export function parseJsonc(text: string): unknown {
  const withoutComments = text.replace(
    /"(?:[^"\\]|\\[\s\S])*"|\/\/[^\r\n]*|\/\*[\s\S]*?\*\//gu,
    (part) => (part.startsWith('"') ? part : " "),
  );
  return JSON.parse(
    withoutComments.replace(/"(?:[^"\\]|\\[\s\S])*"|,(?=\s*[}\]])/gu, (part) =>
      part === "," ? "" : part,
    ),
  );
}
