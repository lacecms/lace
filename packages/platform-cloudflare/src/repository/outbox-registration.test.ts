import { readdir, readFile } from "node:fs/promises";
import { expect, test } from "vitest";

const OUTBOX_INSERT = /insert(?:\s+or\s+ignore)?\s+into\s+outbox_events/giu;
const REGISTERED_INSERT =
  /\.addOutbox\(\s*[`"']\s*insert(?:\s+or\s+ignore)?\s+into\s+outbox_events/giu;

/** Lists repository modules whose outbox inserts are not passed to `addOutbox(`. */
async function unregisteredOutboxInserts(directory: URL): Promise<string[]> {
  const offenders: string[] = [];
  for (const name of (await readdir(directory)).sort()) {
    if (!name.endsWith(".ts") || name.endsWith(".test.ts")) continue;
    const source = await readFile(new URL(name, directory), "utf8");
    const inserts = source.match(OUTBOX_INSERT)?.length ?? 0;
    const registered = source.match(REGISTERED_INSERT)?.length ?? 0;
    if (inserts !== registered) offenders.push(name);
  }
  return offenders;
}

test("every repository outbox insert reports committed work through addOutbox", async () => {
  const directory = new URL("./", import.meta.url);
  const sources = await readdir(directory);
  expect(sources).toContain("base.ts");
  expect(await unregisteredOutboxInserts(directory)).toEqual([]);
});
