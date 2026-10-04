import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { listAppliedMigrations, openNodeDatabase } from "@lacecms/platform-node";

// Copied into the isolated tarball consumer; every import resolves there.
const runtime = fileURLToPath(
  new URL("./migrate.js", import.meta.resolve("@lacecms/platform-node")),
);
const cli = resolve("node_modules/@lacecms/cli/dist/bin.js");
for (const [name, executable, args] of [
  ["cli", cli, ["db", "migrate", "--json"]],
  ["runtime", runtime, []],
]) {
  const path = `${name}/nested/data/lace.sqlite`;
  const invoke = (databasePath, selectedArgs = args) =>
    spawnSync(process.execPath, [executable, ...selectedArgs], {
      env: { ...process.env, LACE_DATABASE_PATH: databasePath },
      encoding: "utf8",
    });
  assert.equal(existsSync(path), false);
  const first = invoke(path);
  assert.equal(first.status, 0, first.stderr);
  const versions =
    name === "cli" ? JSON.parse(first.stdout).data.versions : JSON.parse(first.stdout);
  assert.ok(versions.length > 0);
  let database = openNodeDatabase(path);
  try {
    database.connection
      .prepare("insert into published_state (singleton_key, version, updated_at) values (1, 42, 0)")
      .run();
  } finally {
    database.connection.close();
  }
  const second = invoke(path);
  assert.equal(second.status, 0, second.stderr);
  assert.deepEqual(JSON.parse(second.stdout), JSON.parse(first.stdout));
  database = openNodeDatabase(path);
  try {
    assert.equal(listAppliedMigrations(database.connection).length, versions.length);
    assert.deepEqual(
      database.connection
        .prepare("select version from published_state where singleton_key = 1")
        .get(),
      { version: 42 },
    );
  } finally {
    database.connection.close();
  }
  const blocked = `${name}/blocked-private-path`;
  writeFileSync(blocked, "unchanged");
  const failed = invoke(`${blocked}/data/lace.sqlite`);
  assert.notEqual(failed.status, 0);
  assert.equal(existsSync(`${blocked}/data/lace.sqlite`), false);
  assert.equal(readFileSync(blocked, "utf8"), "unchanged");
  if (name === "cli") {
    assert.equal(failed.status, 6);
    assert.equal(failed.stdout.trim().split("\n").length, 1);
    // Actionable diagnostics name the operation, reason and next step, never the path.
    assert.deepEqual(JSON.parse(failed.stdout), {
      ok: false,
      code: "OPERATION_FAILED",
      message: "Operation failed.",
      operation: "db migrate",
      reason: "The selected filesystem path cannot be used as a database or directory.",
      nextAction:
        "Check LACE_DATABASE_PATH or the selected project path; ensure parent components are directories and the destination has the expected file type, then retry.",
    });
    assert.equal(failed.stderr, "");
    const human = invoke(`${blocked}/data/lace.sqlite`, ["db", "migrate"]);
    assert.equal(human.status, 6);
    assert.equal(human.stdout, "");
    assert.ok(human.stderr.includes("Operation failed."));
    assert.equal(
      (failed.stdout + failed.stderr + human.stdout + human.stderr).includes(blocked),
      false,
    );
  }
}
console.info(
  "Packed CLI and runtime fresh migration, repeat, data preservation and directory failures passed",
);
