import { readdir, readFile } from "node:fs/promises";
import { expect, test } from "vitest";

const OUTBOX_INSERT = /insert(?:\s+or\s+ignore)?\s+into\s+outbox_events/iu;
test("repository outbox inserts come from shared write plans", async () => {
  const directory = new URL("./", import.meta.url);
  const sources = (await readdir(directory)).filter(
    (name) => name.endsWith(".ts") && !name.endsWith(".test.ts"),
  );
  const offenders: string[] = [];
  for (const name of sources) {
    const source = await readFile(new URL(name, directory), "utf8");
    if (OUTBOX_INSERT.test(source)) offenders.push(name);
  }
  expect(sources).toContain("base.ts");
  expect(offenders).toEqual([]);
});
