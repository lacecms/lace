import { describe, test, expect } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import catalog, { validateCatalog } from "./catalog.mjs";
import { validateSources, checkOutput, checkFooters, sections } from "../scripts/check.mjs";

const release = {
  version: catalog.versions[catalog.defaultVersion].target,
  publishedVersions: ["0.1.0-alpha.8", "0.1.0-rc1"],
};
const page = (front, body) => `---\ntitle: Test\ndescription: Fixture\n${front}---\n${body}`;
const overview = page(
  "kind: overview\nverifiedAgainst: " + release.version + "\n",
  "See [a](a/).\n",
);
const guideBody = [
  "Purpose.",
  "## Before you start",
  "None.",
  "## Do it",
  "```md",
  "## Not a heading",
  "```",
  "## Reference",
  "- [CLI](../reference/cli-environment/)",
  "",
].join("\n");
describe("documentation identity", () => {
  test("rejects an unknown default", () =>
    expect(() => validateCatalog({ ...catalog, defaultVersion: "old" })).toThrow("Unknown"));
  test("accepts distinct locale/version content and rejects unknown or duplicate routes", () => {
    const root = mkdtempSync(join(tmpdir(), "lace-doc-catalog-"));
    const definition = {
      ...catalog,
      sections: {},
      locales: { ...catalog.locales, fr: { label: "French", lang: "fr" } },
      versions: { ...catalog.versions, "alpha-5": { label: "Alpha 5", target: "0.1.0-alpha.5" } },
    };
    const write = (path) => {
      mkdirSync(join(root, path, ".."), { recursive: true });
      writeFileSync(join(root, path), overview);
    };
    try {
      for (const lang of Object.keys(definition.locales))
        for (const version of Object.keys(definition.versions))
          write(`${lang}/${version}/index.md`);
      expect(() => validateSources(root, definition, release)).not.toThrow();
      write("en/latest.md");
      expect(() => validateSources(root, definition, release)).toThrow("duplicate");
      rmSync(join(root, "en/latest.md"));
      write("de/latest/index.md");
      expect(() => validateSources(root, definition, release)).toThrow("unknown");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
  test("reports missing local pages, assets and fragments", () => {
    const root = mkdtempSync(join(tmpdir(), "lace-doc-link-"));
    try {
      writeFileSync(join(root, "index.html"), '<a href="/lace/missing/">Broken</a>');
      expect(() => checkOutput(root)).toThrow("missing local target");
      writeFileSync(join(root, "index.html"), '<a href="#unknown">Broken</a>');
      expect(() => checkOutput(root)).toThrow("missing fragment");
      writeFileSync(join(root, "index.html"), '<img src="/outside.png">');
      expect(() => checkOutput(root)).toThrow("escapes base");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("page template and verified version", () => {
  function check(path, text) {
    const root = mkdtempSync(join(tmpdir(), "lace-doc-template-"));
    const definition = { ...catalog, sections: {} };
    try {
      mkdirSync(join(root, "en/latest/guides"), { recursive: true });
      mkdirSync(join(root, "en/latest/reference"), { recursive: true });
      writeFileSync(join(root, "en/latest/index.md"), overview);
      writeFileSync(join(root, path), text);
      validateSources(root, definition, release);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
  const guide = (body, version = release.version) =>
    page(`kind: guide\nverifiedAgainst: ${version}\n`, body);

  test("accepts a guide, a reference page and a published rc version", () => {
    expect(() => check("en/latest/guides/a.md", guide(guideBody))).not.toThrow();
    expect(() => check("en/latest/guides/a.md", guide(guideBody, "0.1.0-rc1"))).not.toThrow();
    const reference = page(`kind: reference\nverifiedAgainst: ${release.version}\n`, "## Table\n");
    expect(() => check("en/latest/reference/a.md", reference)).not.toThrow();
  });
  test("ignores headings inside fenced code", () =>
    expect(sections(guideBody).map((part) => part.heading)).toEqual([
      undefined,
      "Before you start",
      "Do it",
      "Reference",
    ]));
  test("rejects an unknown or missing kind", () => {
    expect(() =>
      check("en/latest/guides/a.md", page(`verifiedAgainst: ${release.version}\n`, "x\n")),
    ).toThrow("en/latest/guides/a.md: unknown kind undefined");
    expect(() =>
      check(
        "en/latest/guides/a.md",
        page(`kind: howto\nverifiedAgainst: ${release.version}\n`, "x\n"),
      ),
    ).toThrow('unknown kind "howto"');
  });
  test("rejects a guide without prerequisites, task or reference link", () => {
    expect(() =>
      check("en/latest/guides/a.md", guide(guideBody.replace("Before you start", "Setup"))),
    ).toThrow('guides/a.md: guide must open with "Before you start"');
    expect(() =>
      check(
        "en/latest/guides/a.md",
        guide("Purpose.\n## Before you start\n## Reference\n[r](../reference/)\n"),
      ),
    ).toThrow("no task section");
    expect(() =>
      check(
        "en/latest/guides/a.md",
        guide(guideBody.replace("../reference/cli-environment/", "../other/")),
      ),
    ).toThrow('"Reference" links no Reference page');
    expect(() => check("en/latest/guides/a.md", guide(guideBody.replace("Purpose.", "")))).toThrow(
      "no purpose paragraph",
    );
  });
  test("rejects a reference page outside the Reference section and an overview with sections", () => {
    const reference = page(`kind: reference\nverifiedAgainst: ${release.version}\n`, "x\n");
    expect(() => check("en/latest/guides/a.md", reference)).toThrow(
      "outside the Reference section",
    );
    expect(() => check("en/latest/guides/a.md", overview + "## Steps\n")).toThrow(
      "overview page has task sections",
    );
  });
  test("rejects alpha, unknown and missing versions", () => {
    for (const version of ["0.1.0-alpha.8", "9.9.9", ""])
      expect(() => check("en/latest/guides/a.md", guide(guideBody, version))).toThrow(
        "is not the current or a published non-alpha release",
      );
  });
  test("rejects a catalog target that differs from the release version", () => {
    const root = mkdtempSync(join(tmpdir(), "lace-doc-empty-"));
    try {
      expect(() => validateSources(root, catalog, { ...release, version: "0.1.0-rc9" })).toThrow(
        "differs from release version 0.1.0-rc9",
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
  test("requires one verified-against footer per built page", () => {
    const root = mkdtempSync(join(tmpdir(), "lace-doc-footer-"));
    try {
      writeFileSync(join(root, "index.html"), '<p class="verified-against">Verified against x</p>');
      expect(() => checkFooters(root)).not.toThrow();
      writeFileSync(join(root, "index.html"), "<p>No footer</p>");
      expect(() => checkFooters(root)).toThrow("found 0");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
