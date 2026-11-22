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

test("unrecognized ledger entries are reported", () => {
  expect(uncheckedNodeMigrations([123456789, baseline?.createdAt ?? 0])).toEqual([123456789]);
  expect(uncheckedD1Migrations(["unknown_fixture.sql", "unknown_fixture_b.sql"])).toEqual([
    "unknown_fixture.sql",
    "unknown_fixture_b.sql",
  ]);
});
