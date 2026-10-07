import { afterEach, expect, test, vi } from "vitest";
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assertHostDatabaseSafe } from "../dist/index.js";

const roots = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});
async function fixture() {
  const cwd = await mkdtemp(join(tmpdir(), "lace-host-safety-"));
  roots.push(cwd);
  await writeFile(join(cwd, "compose.yml"), "services: {}\n");
  await mkdir(join(cwd, "data"));
  return { cwd, databasePath: join(cwd, "data/lace.sqlite"), inContainer: false };
}
const container = (mounts, overrides = {}) => ({
  running: true,
  service: "api",
  workingDirectory: "/opt/lace",
  databasePaths: ["LACE_DATABASE_PATH=/data/lace.sqlite", null],
  mounts,
  ...overrides,
});
const inspection = (mounts, overrides = {}) =>
  vi.fn(async (args) =>
    args[0] === "ps" ? "abcdef123456\n" : JSON.stringify(container(mounts, overrides)),
  );
const bind = (Source, Destination = "/data") => ({ Type: "bind", Source, Destination });

test("refuses matching storage, including symlink aliases, before a database exists", async () => {
  const input = await fixture();
  await symlink(join(input.cwd, "data"), join(input.cwd, "alias"));
  for (const source of [join(input.cwd, "data"), join(input.cwd, "alias")]) {
    await expect(
      assertHostDatabaseSafe({ ...input, inspect: inspection([bind(source)]) }),
    ).rejects.toMatchObject({ reason: "compose-active" });
    expect(existsSync(input.databasePath)).toBe(false);
  }
});

test("stopped and unrelated mounts do not block maintenance", async () => {
  const input = await fixture();
  for (const inspect of [
    inspection([bind(join(input.cwd, "data"))], { running: false }),
    inspection([bind(tmpdir() + "/other-installation")]),
    inspection([bind(join(input.cwd, "data"))], {
      databasePaths: ["LACE_DATABASE_PATH=/data/other.sqlite", null],
    }),
    async () => "",
  ])
    await expect(assertHostDatabaseSafe({ ...input, inspect })).resolves.toBeUndefined();
});

test("required inspection fails closed without repeating raw errors", async () => {
  const input = await fixture();
  for (const inspect of [
    async () => {
      throw new Error("secret-docker-output");
    },
    async () => "malformed",
    inspection(null),
    inspection([bind("relative")]),
    inspection([bind(input.cwd)], { databasePaths: [null] }),
    inspection([bind(input.cwd)], { service: "dispatcher", databasePaths: [null] }),
    inspection([bind(input.cwd)], { databasePaths: ["LACE_DATABASE_PATH=", null] }),
    inspection([bind(input.cwd)], {
      databasePaths: ["LACE_DATABASE_PATH=/data/a", "LACE_DATABASE_PATH=/data/b", null],
    }),
    inspection([bind(input.cwd)], {
      databasePaths: ["LACE_DATABASE_PATH=data/lace.sqlite", null],
      workingDirectory: "relative",
    }),
    inspection([bind(input.cwd), bind(input.cwd)]),
    inspection([bind(input.cwd)], { databasePaths: [] }),
  ]) {
    await expect(assertHostDatabaseSafe({ ...input, inspect })).rejects.toMatchObject({
      reason: "compose-inspection",
    });
  }
  expect(existsSync(input.databasePath)).toBe(false);
});

test("memory, container maintenance and Node-only projects do not require Docker", async () => {
  const input = await fixture();
  const inspect = vi.fn(async () => {
    throw new Error("unavailable");
  });
  await assertHostDatabaseSafe({ ...input, databasePath: ":memory:", inspect });
  await assertHostDatabaseSafe({ ...input, inContainer: true, inspect });
  await rm(join(input.cwd, "compose.yml"));
  await assertHostDatabaseSafe({ ...input, inspect });
  expect(inspect).not.toHaveBeenCalled();
});

test("a running source-only builder does not block the stopped database's maintenance", async () => {
  const input = await fixture();
  const inspect = inspection([bind(input.cwd, "/source")], {
    service: "builder",
    databasePaths: [null],
  });
  await expect(assertHostDatabaseSafe({ ...input, inspect })).resolves.toBeUndefined();
  expect(inspect.mock.calls[1][0][2]).not.toContain("{{json .Config.Env}}");
  expect(inspect.mock.calls[1][0][2]).toContain('"LACE_DATABASE_PATH"');
});

test("relative database paths use the container working directory and custom services are checked", async () => {
  const input = await fixture();
  await expect(
    assertHostDatabaseSafe({
      ...input,
      inspect: inspection([bind(input.cwd, "/installation")], {
        service: "custom-database-consumer",
        workingDirectory: "/installation",
        databasePaths: ["LACE_DATABASE_PATH=data/lace.sqlite", null],
      }),
    }),
  ).rejects.toMatchObject({ reason: "compose-active" });
});

test("the most-specific mount wins and named volumes or internal storage do not alias host SQLite", async () => {
  const input = await fixture();
  const mounts = [
    bind(input.cwd, "/installation"),
    { Type: "volume", Source: "/var/lib/docker/volumes/owned", Destination: "/installation/data" },
  ];
  for (const inspect of [
    inspection(mounts, {
      databasePaths: ["LACE_DATABASE_PATH=/installation/data/lace.sqlite", null],
    }),
    inspection([]),
    inspection([bind(input.cwd)], { databasePaths: ["LACE_DATABASE_PATH=:memory:", null] }),
  ])
    await expect(assertHostDatabaseSafe({ ...input, inspect })).resolves.toBeUndefined();
});

test("a directly mounted read-only database is still a matching consumer", async () => {
  const input = await fixture();
  const mounts = [{ ...bind(input.databasePath, "/database.sqlite"), RW: false }];
  await expect(
    assertHostDatabaseSafe({
      ...input,
      inspect: inspection(mounts, {
        databasePaths: ["LACE_DATABASE_PATH=/database.sqlite", null],
      }),
    }),
  ).rejects.toMatchObject({ reason: "compose-active" });
});

test("missing inspection records and duplicate container IDs fail closed", async () => {
  const input = await fixture();
  for (const inspect of [
    async (args) => (args[0] === "ps" ? "abcdef123456\n" : ""),
    async () => "abcdef123456\nabcdef123456\n",
  ])
    await expect(assertHostDatabaseSafe({ ...input, inspect })).rejects.toMatchObject({
      reason: "compose-inspection",
    });
});
