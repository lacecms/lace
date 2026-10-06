/**
 * Pure readers of the consumer-facing documents that acceptance follows, so a
 * drift between the generated development guide and the tested flow fails.
 */

/** The `.env` settings the generated development guide asks the operator to review. */
export const reviewSettings = Object.freeze([
  "LACE_API_IMAGE",
  "LACE_BUILDER_IMAGE",
  "LACE_API_PORT",
  "LACE_HTTP_PORT",
  "LACE_PUBLIC_BASE_URL",
  "LACE_API_BASE_URL",
]);

/** The generated Compose development guide that holds the Node setup sequence. */
export const developmentGuide = "docs/lace-compose-dev.md";

/** The development guide sections whose shell commands make up the Node setup sequence. */
export const developmentSetupSections = Object.freeze([
  "Install and prepare the environment",
  "Prepare the database and start the CMS",
]);

/**
 * The generated scenario guides acceptance follows, the sections whose fenced
 * `bash` commands it runs and the reviewed order of those commands for a
 * starter project. A guide that drops, renames or reorders one fails the suite.
 */
export const scenarioGuides = Object.freeze({
  development: Object.freeze({
    path: developmentGuide,
    sections: developmentSetupSections,
    sequence: Object.freeze([
      "pnpm install",
      "pnpm env:prepare",
      "pnpm exec lace doctor --target node --mode compose --stage setup",
      "pnpm db:migrate",
      "pnpm content:sync",
      "pnpm auth:bootstrap",
      "pnpm dev:api",
    ]),
  }),
  production: Object.freeze({
    path: "docs/lace-compose-production.md",
    sections: Object.freeze([
      "Install and prepare the environment",
      "Initialize the CMS",
      "Start the full stack",
      "Repeat operations",
    ]),
    sequence: Object.freeze([
      "pnpm install",
      "pnpm env:prepare",
      "pnpm exec lace doctor --target node --mode compose --stage setup",
      "pnpm db:migrate",
      "pnpm content:sync",
      "pnpm auth:bootstrap",
      "pnpm dev:api",
      "pnpm prod:start",
      "docker compose ps",
      "docker compose stop api dispatcher",
      "pnpm db:migrate",
      "pnpm content:sync",
      "pnpm prod:start",
    ]),
  }),
  cloudflare: Object.freeze({
    path: "docs/lace-cloudflare.md",
    sections: Object.freeze(["Run the Worker locally", "Build the site against the local Worker"]),
    sequence: Object.freeze([
      "pnpm install",
      "pnpm env:prepare",
      "pnpm cf:env:prepare",
      "pnpm cf:db:migrate",
      "pnpm cf:content:sync",
      "pnpm cf:auth:bootstrap",
      "pnpm cf:dev",
      "pnpm build",
      "pnpm exec lace doctor --target cloudflare-local --stage ready",
      "pnpm cf:build",
    ]),
  }),
});

function section(markdown, heading, path) {
  const lines = markdown.split("\n");
  const start = lines.indexOf(`## ${heading}`);
  if (start === -1) throw new Error(`${path} section "${heading}" is missing`);
  const end = lines.findIndex((line, index) => index > start && line.startsWith("## "));
  return lines.slice(start + 1, end === -1 ? undefined : end);
}

/** Shell lines of the fenced `bash` blocks in a scenario guide's command sections, in order. */
export function guideCommands(markdown, guide) {
  const commands = [];
  for (const heading of guide.sections) {
    let fenced = false;
    for (const line of section(markdown, heading, guide.path)) {
      if (!fenced && line.trim() === "```bash") fenced = true;
      else if (fenced && line.trim() === "```") fenced = false;
      else if (fenced && line.trim() !== "" && !line.trim().startsWith("#"))
        commands.push(line.trim());
    }
  }
  return commands;
}

/**
 * Compares the documented commands with the guide's reviewed sequence and the
 * project's scripts; returns the first discrepancy naming the guide, or null.
 */
export function guideDrift(guide, commands, scripts, expected = guide.sequence) {
  for (let index = 0; index < Math.max(commands.length, expected.length); index++) {
    if (commands[index] !== expected[index])
      return `${guide.path} step ${index + 1} documents "${commands[index] ?? "(none)"}", acceptance runs "${expected[index] ?? "(none)"}"`;
    const [tool, script] = commands[index].split(" ");
    if (tool === "pnpm" && !["install", "exec"].includes(script) && !(script in scripts))
      return `${guide.path} "${commands[index]}" names no package script`;
  }
  return null;
}

/** Shell lines of the fenced `bash` blocks in the development guide's setup sections, in order. */
export function developmentSetupCommands(guide) {
  return guideCommands(guide, scenarioGuides.development);
}

/**
 * Compares the documented setup commands with the reviewed sequence and the
 * project's scripts; returns the first discrepancy naming the guide, or null.
 */
export function setupDrift(commands, expected, scripts) {
  return guideDrift(scenarioGuides.development, commands, scripts, expected);
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

/** The development guide's review step: only the documented review settings may change. */
export function reviewEnvironment(text, values) {
  for (const name of Object.keys(values))
    if (!reviewSettings.includes(name)) throw new Error(`env: ${name} is not a review setting`);
  return updateEnvironment(text, values);
}
