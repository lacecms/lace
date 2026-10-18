import { describe, test, expect } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import catalog, { validateCatalog } from "./catalog.mjs";
import { validateSources, checkOutput } from "../scripts/check.mjs";
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
      writeFileSync(join(root, path), "---\ntitle: Test\ndescription: Fixture\n---\nBody\n");
    };
    try {
      for (const lang of Object.keys(definition.locales))
        for (const version of Object.keys(definition.versions))
          write(`${lang}/${version}/index.md`);
      expect(() => validateSources(root, definition)).not.toThrow();
      write("en/latest.md");
      expect(() => validateSources(root, definition)).toThrow("duplicate");
      rmSync(join(root, "en/latest.md"));
      write("de/latest/index.md");
      expect(() => validateSources(root, definition)).toThrow("unknown");
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
