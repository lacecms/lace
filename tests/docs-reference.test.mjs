// Every item of the shipped public interface must be named by a public Reference
// page. Each list is derived from the artifact that ships it, never kept here.
import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const workspace = fileURLToPath(new URL("..", import.meta.url));
const referenceDirectory = join(workspace, "apps/docs/src/content/docs/en/latest/reference");
const templates = join(workspace, "packages/create-lace/templates");
const settingFiles = [
  ".env.example",
  "worker/.dev.vars.example",
  "worker/wrangler.jsonc",
  "docker-compose.yml",
  "docs/cloudflare-operator.env.example",
];
const configurationTypes = {
  "packages/config/src/models/types.ts": [
    "LaceConfigInput",
    "CommonModelInput",
    "RoutableModelInput",
    "PageModelInput",
    "CollectionModelInput",
    "CollectionListOptions",
    "ModelSeoInput",
    "SeoDefaultsInput",
    "GlobalModelInput",
  ],
  "packages/content/src/blocks/types.ts": ["BlockDefinitionInput"],
  "packages/content/src/fields/definitions.ts": ["CommonFieldOptions"],
};

const escape = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Command names from `lace --help`: `<a|b [--x]|c>` alternations or the words before options. */
export function laceCommands(help) {
  const commands = new Set();
  for (const line of help.split("\n")) {
    const rest =
      /^(?:Usage:)?\s+lace (.*)$/.exec(line)?.[1] ?? /^Usage: lace (.*)$/.exec(line)?.[1];
    if (rest === undefined) continue;
    if (rest.startsWith("<")) {
      let depth = 0;
      let end = 0;
      for (; end < rest.length; end += 1) {
        if (rest[end] === "<" || rest[end] === "[") depth += 1;
        if (rest[end] === ">" || rest[end] === "]") depth -= 1;
        if (depth === 0) break;
      }
      for (const alternative of rest.slice(1, end).split("|"))
        commands.add(alternative.replace(/\[[^\]]*\]/g, "").trim());
    } else {
      const words = [];
      for (const word of rest.split(/\s+/)) {
        if (/^[<[\-|]/.test(word) || word.includes("|")) break;
        words.push(word);
      }
      commands.add(words.join(" "));
    }
  }
  commands.delete("");
  return [...commands];
}

/** Long flags printed by a help text. */
export function longFlags(help) {
  return [...new Set(help.match(/--[a-z][a-z-]*[a-z]/g) ?? [])];
}

/** `LACE_*` setting names; a name ending in `_` is a prose prefix, not a setting. */
export function settingNames(text) {
  return [...new Set(text.match(/\bLACE_[A-Z0-9_]*[A-Z0-9]\b/g) ?? [])];
}

/**
 * Property names declared directly by the named interfaces of one TypeScript
 * source file. The workspace TypeScript (7) has no JavaScript compiler API, so
 * this scans the declaration body: members are the depth-one `name:`/`name?:`
 * lines outside comments.
 */
export function interfaceMembers(path, names) {
  const text = readFileSync(path, "utf8");
  return names.flatMap((name) => {
    const start = new RegExp(`\\binterface ${name}\\b`).exec(text);
    if (!start) throw new Error(`${path}: no interface ${name}`);
    // The body is the first `{` outside the generic parameter list.
    let index = start.index;
    for (let angle = 0; index < text.length; index += 1) {
      if (text[index] === "<") angle += 1;
      if (text[index] === ">" && text[index - 1] !== "=") angle -= 1;
      if (text[index] === "{" && angle === 0) break;
    }
    const members = [];
    let depth = 0;
    let line = "";
    for (let cursor = index; cursor < text.length; cursor += 1) {
      const character = text[cursor];
      if (character === "{") depth += 1;
      if (character === "}") depth -= 1;
      if (depth === 0) break;
      if (character === "\n") {
        const member = /^\s*(?:readonly\s+)?([A-Za-z_$][\w$]*)\??\s*:/.exec(line)?.[1];
        if (member && depth === 1 && !/^\s*(?:\/\/|\*|\/\*)/.test(line)) members.push(member);
        line = "";
      } else line += character;
    }
    if (members.length === 0) throw new Error(`${path}: interface ${name} has no members`);
    return members;
  });
}

const normalizePath = (path) => path.replace(/\{[^}]+\}|:[A-Za-z]+/g, "{}");

/** Items whose name no Reference text mentions, as `kind: name`. */
export function findMissing(text, inventory) {
  const normalized = normalizePath(text);
  return inventory
    .filter(({ kind, name }) => {
      if (kind === "REST path")
        return !new RegExp(`${escape(normalizePath(name))}(?![\\w/{}-])`).test(normalized);
      return !patterns[kind](name).test(text);
    })
    .map(({ kind, name }) => `${kind}: ${name}`);
}

const patterns = {
  "CLI command": (name) => new RegExp(`\\blace ${escape(name)}\\b`),
  "create-lace mode": (name) => new RegExp(`\\bcreate-lace ${escape(name)}\\b`),
  "CLI flag": (name) => new RegExp(`${escape(name)}(?![a-z-])`),
  setting: (name) => new RegExp(`\\b${name}\\b`),
  "configuration option": (name) => new RegExp(`\`${escape(name)}(?![\\w])`),
  "field builder": (name) => new RegExp(`field\\.${escape(name)}\\b`),
  "MCP tool": (name) => new RegExp(`\`${escape(name)}\``),
  "MCP scope": (name) => new RegExp(`\`${escape(name)}\``),
};

// `create-lace --help` prints usage on stderr and exits nonzero; read both streams.
function help(bin) {
  const result = spawnSync(process.execPath, [join(workspace, bin), "--help"], {
    encoding: "utf8",
  });
  const text = `${result.stdout}${result.stderr}`;
  if (!text.includes("Usage:")) throw new Error(`${bin} --help printed no usage`);
  return text;
}

async function inventory() {
  const laceHelp = help("packages/cli/dist/bin.js");
  const createHelp = help("packages/create-lace/dist/bin.js");
  const commands = laceCommands(laceHelp);
  if (commands.length === 0) throw new Error("lace --help yielded no commands");
  const settings = settingNames(
    [laceHelp, ...settingFiles.map((file) => readFileSync(join(templates, file), "utf8"))].join(
      "\n",
    ),
  );
  const options = Object.entries(configurationTypes).flatMap(([file, names]) =>
    interfaceMembers(join(workspace, file), names),
  );
  const { field } = await import("../packages/content/dist/index.js");
  const { mcpToolArgumentSchemas } = await import("../packages/contracts/dist/index.js");
  const { MCP_OAUTH_SCOPES } = await import("../packages/auth/dist/index.js");
  const api = JSON.parse(readFileSync(join(workspace, "apps/api/openapi/api-v1.json"), "utf8"));
  const items = (kind, names) => [...new Set(names)].map((name) => ({ kind, name }));
  return [
    ...items("CLI command", commands),
    ...items("create-lace mode", ["create", "init"]),
    ...items("CLI flag", [...longFlags(laceHelp), ...longFlags(createHelp)]),
    ...items("setting", settings),
    ...items("configuration option", options),
    ...items("field builder", Object.keys(field)),
    ...items("REST path", Object.keys(api.paths)),
    ...items("MCP tool", Object.keys(mcpToolArgumentSchemas)),
    ...items("MCP scope", MCP_OAUTH_SCOPES),
  ];
}

function referenceText() {
  return readdirSync(referenceDirectory, { recursive: true })
    .filter((name) => /\.mdx?$/.test(name))
    .map((name) => readFileSync(join(referenceDirectory, name), "utf8"))
    .join("\n");
}

describe("reference extractors", () => {
  const sample = [
    "Usage: lace <db migrate|content sync [--check]|auth bootstrap> [--target node] [--json]",
    "       lace env prepare [--target cloudflare-local] [--json]",
    "Usage: lace doctor --target node --stage setup|ready [--mode native|compose] [--json]",
    "Usage: lace add block <type...>|--all [--site <dir>] [--dry-run]",
    "Usage: lace import <dir> [--url <origin>]",
    "Default: read-only dry run. The token is read only from LACE_IMPORT_TOKEN; never LACE_PUBLIC_*.",
    "Usage: lace cloudflare preflight --target cloudflare-remote",
  ].join("\n");

  test("expands command alternations and stops at options", () =>
    expect(laceCommands(sample)).toEqual([
      "db migrate",
      "content sync",
      "auth bootstrap",
      "env prepare",
      "doctor",
      "add block",
      "import",
      "cloudflare preflight",
    ]));
  test("collects long flags and settings, skipping prose prefixes", () => {
    expect(longFlags(sample)).toEqual([
      "--check",
      "--target",
      "--json",
      "--stage",
      "--mode",
      "--all",
      "--site",
      "--dry-run",
      "--url",
    ]);
    expect(settingNames(sample)).toEqual(["LACE_IMPORT_TOKEN"]);
  });
  test("names every missing item and its kind", () => {
    const items = [
      { kind: "CLI command", name: "doctor" },
      { kind: "CLI flag", name: "--dry-run" },
      { kind: "setting", name: "LACE_AUTH_SECRET" },
      { kind: "configuration option", name: "removedFields" },
      { kind: "field builder", name: "text" },
      { kind: "REST path", name: "/api/v1/admin/media/{mediaId}" },
      { kind: "MCP tool", name: "get_entry" },
      { kind: "MCP scope", name: "content:read" },
    ];
    const complete =
      "`lace doctor` `--dry-run` LACE_AUTH_SECRET `removedFields` `field.text()` " +
      "`/api/v1/admin/media/:mediaId` `get_entry` `content:read`";
    expect(findMissing(complete, items)).toEqual([]);
    expect(
      findMissing(
        "`lace doctors` --dry-runs `removedFieldsX` /api/v1/admin/media/:mediaId/tags",
        items,
      ),
    ).toEqual(items.map(({ kind, name }) => `${kind}: ${name}`));
  });
});

test("Reference pages name every shipped public interface item", async () => {
  expect(findMissing(referenceText(), await inventory())).toEqual([]);
});
