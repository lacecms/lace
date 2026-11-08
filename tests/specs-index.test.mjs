import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";

const specs = fileURLToPath(new URL("../openspec/specs/", import.meta.url));

export function indexedCapabilities(readme) {
  return [...readme.matchAll(/^- \[([a-z0-9-]+)\]\(\1\/spec\.md\)$/gmu)].map((match) => match[1]);
}

test("the specification index lists every capability exactly once", () => {
  const listed = indexedCapabilities(readFileSync(join(specs, "README.md"), "utf8"));
  const directories = readdirSync(specs, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
  const duplicates = listed.filter((name, index) => listed.indexOf(name) !== index);
  expect(duplicates).toEqual([]);
  expect([...listed].sort()).toEqual([...directories].sort());
});

test("index entries are parsed only from list links to their own spec", () => {
  expect(
    indexedCapabilities(
      "- [a-cap](a-cap/spec.md)\n- [b](c/spec.md)\n  - [d](d/spec.md)\nText [e](e/spec.md)\n",
    ),
  ).toEqual(["a-cap"]);
});
