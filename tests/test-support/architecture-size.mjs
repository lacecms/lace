export const FILE_LIMIT = 600;
export const DIRECTORY_WARNING = 3_000;

export function countArchitectureLines(source) {
  const lines = source === "" ? [] : source.replace(/\n$/, "").split("\n");
  let inside = false;
  let file = 0;
  let nonblank = 0;
  for (const line of lines) {
    if (!inside && line.startsWith("```mermaid")) inside = true;
    else if (inside && line.startsWith("```")) inside = false;
    else if (!inside) {
      file += 1;
      if (line.trim()) nonblank += 1;
    }
  }
  return { file, nonblank };
}

export function architectureSizeDiagnostics(files) {
  let total = 0;
  const oversized = [];
  for (const [name, source] of files) {
    const count = countArchitectureLines(source);
    total += count.nonblank;
    if (count.file > FILE_LIMIT) {
      oversized.push(`${name}: ${count.file} lines (limit ${FILE_LIMIT})`);
    }
  }
  const warning =
    total > DIRECTORY_WARNING
      ? `Architecture documentation has ${total} nonblank lines outside Mermaid blocks (review threshold ${DIRECTORY_WARNING}); review duplication and stale detail.`
      : null;
  return { oversized, warning };
}

export function warnArchitectureSize(warning) {
  if (warning) process.stderr.write(`${warning}\n`);
}
