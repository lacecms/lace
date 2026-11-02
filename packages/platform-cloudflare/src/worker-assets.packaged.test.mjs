import { readdir, readFile } from "node:fs/promises";
import { expect, test } from "vitest";

test("packaged Worker carries the admin entry and its built assets", async () => {
  const directory = new URL("../admin/", import.meta.url);
  const html = await readFile(new URL("index.html", directory), "utf8");
  expect(html).toContain("<html");
  expect(await readdir(new URL("assets/", directory))).not.toHaveLength(0);
});
