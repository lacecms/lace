import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { expect, test } from "vitest";
for (const variant of ["default", "cloudflare"]) {
  test(`${variant} pre-33F template has immutable revision provenance and valid managed hashes`, async () => {
    const fixture = JSON.parse(
      await readFile(new URL(`fixtures/template-0.14.0/${variant}.json`, import.meta.url), "utf8"),
    );
    expect(fixture.provenance.sourceRevision).toBe("5f7c19b5cc72f7f78640870f04e9c897615cc010");
    expect(fixture.provenance.templateVersion).toBe("0.14.0");
    const manifest = JSON.parse(fixture.files[".lace/manifest.json"]);
    expect(manifest.templateVersion).toBe("0.14.0");
    for (const [path, record] of Object.entries(manifest.files)) {
      if (record.owner === "managed")
        expect(createHash("sha256").update(fixture.files[path]).digest("hex"), path).toBe(
          record.sha256,
        );
    }
    expect(fixture.files["docs/cloudflare-operator.env.example"]).toBeUndefined();
  });
}
