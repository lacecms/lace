import { expect, test } from "vitest";
import { uncheckedD1Migrations, uncheckedNodeMigrations } from "./ledger.js";
import { checkedInMigrations } from "./migrations.js";

const baseline = checkedInMigrations[0];

test("an empty or checked-in ledger has no unchecked migrations", () => {
  expect(baseline).toBeDefined();
  expect(uncheckedNodeMigrations([])).toEqual([]);
  expect(uncheckedD1Migrations([])).toEqual([]);
  expect(uncheckedNodeMigrations(checkedInMigrations.map((item) => item.createdAt))).toEqual([]);
  expect(uncheckedD1Migrations(checkedInMigrations.map((item) => item.name))).toEqual([]);
});

test("ledger entries from before the baseline are reported", () => {
  expect(uncheckedNodeMigrations([1789240330790, baseline?.createdAt ?? 0])).toEqual([
    1789240330790,
  ]);
  expect(
    uncheckedD1Migrations(["0000_exotic_tarantula.sql", "0015_import_credentials.sql"]),
  ).toEqual(["0000_exotic_tarantula.sql", "0015_import_credentials.sql"]);
});
