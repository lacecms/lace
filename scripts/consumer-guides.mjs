/**
 * Pure readers of the consumer-facing documents that acceptance follows, so a
 * drift between the generated README or guide and the tested flow fails.
 */

/** The `.env` settings the generated README asks the operator to review. */
export const reviewSettings = Object.freeze([
  "LACE_API_IMAGE",
  "LACE_BUILDER_IMAGE",
  "LACE_API_PORT",
  "LACE_HTTP_PORT",
  "LACE_PUBLIC_BASE_URL",
  "LACE_API_BASE_URL",
]);

/** The README sections whose shell commands make up the Node setup sequence. */
export const readmeSetupSections = Object.freeze([
  "Prerequisites and installation",
  "Prepare and start the CMS",
]);

function section(markdown, heading) {
  const lines = markdown.split("\n");
  const start = lines.indexOf(`## ${heading}`);
  if (start === -1) throw new Error(`README section "${heading}" is missing`);
  const end = lines.findIndex((line, index) => index > start && line.startsWith("## "));
  return lines.slice(start + 1, end === -1 ? undefined : end);
}

/** Shell lines of the fenced `bash` blocks in the README setup sections, in order. */
export function readmeSetupCommands(readme) {
  const commands = [];
  for (const heading of readmeSetupSections) {
    let fenced = false;
    for (const line of section(readme, heading)) {
      if (!fenced && line.trim() === "```bash") fenced = true;
      else if (fenced && line.trim() === "```") fenced = false;
      else if (fenced && line.trim() !== "" && !line.trim().startsWith("#"))
        commands.push(line.trim());
    }
  }
  return commands;
}

/** Files the connection guide asks the operator to create: a `` `path`: `` line, then a fence. */
export function guideFiles(markdown) {
  const files = new Map();
  const lines = markdown.split("\n");
  for (let index = 0; index < lines.length; index++) {
    const path = /^`([^`\s]+)`:$/u.exec(lines[index])?.[1];
    if (path === undefined) continue;
    let open = index + 1;
    while (lines[open] === "") open++;
    if (!/^```[a-z]*$/u.test(lines[open] ?? ""))
      throw new Error(`guide: ${path} is not followed by a code block`);
    const close = lines.findIndex((line, at) => at > open && line === "```");
    if (close === -1) throw new Error(`guide: code block for ${path} is not closed`);
    if (files.has(path)) throw new Error(`guide: ${path} is defined twice`);
    files.set(path, `${lines.slice(open + 1, close).join("\n")}\n`);
    index = close;
  }
  return files;
}

/**
 * Replaces existing dotenv assignments in place, keeping every other byte.
 * Fails for a missing or repeated assignment and for multi-line values.
 */
export function updateEnvironment(text, values) {
  let result = text;
  for (const [name, value] of Object.entries(values)) {
    if (/[\r\n]/u.test(String(value))) throw new Error(`env: ${name} value spans lines`);
    const pattern = new RegExp(`^${name}=.*$`, "gmu");
    const matches = result.match(pattern)?.length ?? 0;
    if (matches !== 1) throw new Error(`env: expected one ${name} assignment, found ${matches}`);
    result = result.replace(pattern, () => `${name}=${value}`);
  }
  return result;
}

/** The README's review step: only the documented review settings may change. */
export function reviewEnvironment(text, values) {
  for (const name of Object.keys(values))
    if (!reviewSettings.includes(name)) throw new Error(`env: ${name} is not a review setting`);
  return updateEnvironment(text, values);
}
