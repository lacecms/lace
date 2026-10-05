import { chmod, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { parseOperatorFile, resolveOperatorEnvironment } from "../dist/operator-environment.js";
const roots = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((p) => rm(p, { recursive: true, force: true })));
});
const text =
  "CLOUDFLARE_ACCOUNT_ID=account\nCLOUDFLARE_API_TOKEN=private-sentinel\nLACE_D1_DATABASE_ID=db\nLACE_WRANGLER_CONFIG=worker/wrangler.jsonc\n";
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "lace-operator-"));
  roots.push(root);
  await writeFile(join(root, "private"), text, { mode: 0o600 });
  return root;
}
test("explicit file supports process precedence, empty override and no mutation", async () => {
  const root = await fixture();
  const values = { CLOUDFLARE_API_TOKEN: "", NODE_OPTIONS: "private-options" };
  expect((await resolveOperatorEnvironment("private", {}, root)).tokenSource).toBe("operator-file");
  const result = await resolveOperatorEnvironment("private", values, root);
  expect(result.values.CLOUDFLARE_API_TOKEN).toBe("");
  expect(result.values.NODE_OPTIONS).toBeUndefined();
  expect(values).toEqual({ CLOUDFLARE_API_TOKEN: "", NODE_OPTIONS: "private-options" });
  expect(await readFile(join(root, "private"), "utf8")).toBe(text);
  expect((await resolveOperatorEnvironment(undefined, {}, root)).tokenSource).toBe("absent");
});
test("unsafe selected files fail closed without raw path or credential", async () => {
  const root = await fixture();
  await symlink(join(root, "private"), join(root, "link"));
  await mkdir(join(root, "directory"));
  await writeFile(join(root, "large"), "a".repeat(65537), { mode: 0o600 });
  for (const name of ["missing", "link", "directory", "large"]) {
    await expect(
      resolveOperatorEnvironment(name, { CLOUDFLARE_API_TOKEN: "sentinel" }, root),
    ).rejects.toMatchObject({ code: "CONFIG", exitCode: 4 });
    try {
      await resolveOperatorEnvironment(name, {}, root);
    } catch (e) {
      expect(e.message).not.toContain(root);
      expect(e.message).not.toContain("private-sentinel");
    }
  }
  if (process.platform !== "win32") {
    await chmod(join(root, "private"), 0o644);
    await expect(resolveOperatorEnvironment("private", {}, root)).rejects.toThrow("operator file");
  }
});
test("operator grammar rejects duplicates, unknown keys and malformed values without executing", () => {
  for (const input of [
    "broken",
    "NODE_OPTIONS=bad",
    "CLOUDFLARE_API_TOKEN=a\nCLOUDFLARE_API_TOKEN=b",
    'CLOUDFLARE_API_TOKEN="unterminated',
    "CLOUDFLARE_API_TOKEN='unterminated",
    "CLOUDFLARE_API_TOKEN=`bad`",
  ])
    expect(() => parseOperatorFile(input)).toThrow();
  expect(parseOperatorFile("CLOUDFLARE_API_TOKEN=$(touch marker)\n").CLOUDFLARE_API_TOKEN).toBe(
    "$(touch marker)",
  );
});
