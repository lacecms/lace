import { expect, test, afterEach } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { mkdtemp, writeFile, readdir, readFile, rm, mkdir, symlink, chmod } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { checkedInMigrations } from "@lacecms/platform-node";
import { nodeMigrations } from "../dist/doctor-probes.js";
import { doctorIO } from "../dist/doctor-io.js";
import { runDoctor } from "../dist/doctor.js";

const roots = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});
async function directory() {
  const root = await mkdtemp(join(tmpdir(), "lace-doctor-sqlite-"));
  roots.push(root);
  return root;
}
function database(path, current = true) {
  const db = new DatabaseSync(path);
  db.exec(
    "create table __drizzle_migrations (created_at integer); create table preserved (value text); insert into preserved values ('private-sentinel')",
  );
  const insert = db.prepare("insert into __drizzle_migrations values (?)");
  for (const item of current ? checkedInMigrations : checkedInMigrations.slice(0, 1))
    insert.run(item.createdAt);
  return db;
}
async function snapshot(root) {
  const files = await readdir(root);
  return Object.fromEntries(
    await Promise.all(
      files.map(async (file) => [file, (await readFile(join(root, file))).toString("hex")]),
    ),
  );
}
const inspect = (root, path = "db.sqlite") =>
  nodeMigrations(doctorIO, root, { LACE_DATABASE_PATH: path }, AbortSignal.timeout(5000));

// These cases run several separately bounded child processes; their total CI
// budget must exceed the five-second deadline of an individual doctor probe.
test(
  "real SQLite current, outdated and absent inspection creates no state",
  { timeout: 20_000 },
  async () => {
    const root = await directory();
    expect((await inspect(root, "missing/never-created.sqlite")).kind).toBe("unfinished");
    expect(await readdir(root)).toEqual([]);
    for (const current of [true, false]) {
      const db = database(join(root, "db.sqlite"), current);
      db.close();
      const before = await snapshot(root);
      const result = await inspect(root);
      expect(result.kind).toBe(current ? "pass" : "unfinished");
      expect(await snapshot(root)).toEqual(before);
      await rm(join(root, "db.sqlite"));
    }
  },
);

test("concurrent complete doctors preserve a populated installation", async () => {
  const root = await directory();
  await writeFile(
    join(root, "package.json"),
    JSON.stringify({ engines: { node: ">=24.12.0", pnpm: ">=12" } }),
  );
  database(join(root, "db.sqlite")).close();
  const before = await snapshot(root);
  const runtime = {
    cwd: root,
    environment: {
      LACE_DATABASE_PATH: "db.sqlite",
      LACE_API_BASE_URL: "http://127.0.0.1:3000/",
      LACE_PUBLIC_BASE_URL: "http://127.0.0.1:3000/",
      LACE_AUTH_SECRET: "a".repeat(64),
      LACE_MINIO_ACCESS_KEY: "access",
      LACE_MINIO_SECRET_KEY: "s".repeat(64),
      LACE_MINIO_ENDPOINT: "http://127.0.0.1:9000/",
      LACE_MINIO_BUCKET: "lace-media",
      LACE_MINIO_REGION: "us-east-1",
      LACE_MINIO_TIMEOUT_MS: "5000",
      LACE_BUILD_TOKEN: "private-sentinel",
    },
    io: {
      ...doctorIO,
      nodeVersion: "24.12.0",
      process: async (command, args, cwd, signal) =>
        command === "pnpm" ? "12.3.4" : doctorIO.process(command, args, cwd, signal),
      request: async () => Response.json({ status: "ready" }),
    },
  };
  const options = { target: "node", stage: "ready", mode: "native", json: true };
  const results = await Promise.all([runDoctor(options, runtime), runDoctor(options, runtime)]);
  expect(results.map((item) => item.exitCode)).toEqual([0, 0]);
  expect(results[0].output).toBe(results[1].output);
  expect(results[0].output).not.toContain("private-sentinel");
  expect(await snapshot(root)).toEqual(before);
});

test(
  "missing ledger, corrupt, denied, symlink and wrong file type have safe diagnostics",
  { timeout: 20_000 },
  async () => {
    const root = await directory();
    const path = join(root, "db.sqlite");
    const db = new DatabaseSync(path);
    db.close();
    expect((await inspect(root)).kind).toBe("unfinished");
    await writeFile(path, "private-error-sentinel");
    expect((await inspect(root)).kind).toBe("operation");
    await rm(path);
    await symlink("missing", path);
    expect((await inspect(root)).kind).toBe("operation");
    await rm(path);
    await mkdir(path);
    expect((await inspect(root)).kind).toBe("operation");
    await rm(path, { recursive: true });
    database(path).close();
    await chmod(path, 0);
    try {
      if (process.getuid?.() !== 0) expect((await inspect(root)).reason).toContain("denied");
    } finally {
      await chmod(path, 0o600);
    }
  },
);

test("locked SQLite never mutates the selected database", async () => {
  const root = await directory();
  const path = join(root, "db.sqlite");
  // POSIX locks are process-scoped; use a separate child to hold the lock.
  database(path).close();
  const { spawn } = await import("node:child_process");
  const child = spawn(
    process.execPath,
    [
      "--disable-warning=ExperimentalWarning",
      "--input-type=module",
      "-e",
      "import {DatabaseSync} from 'node:sqlite'; const db=new DatabaseSync(process.argv[1]); db.exec('begin exclusive'); console.info('locked'); setInterval(()=>{},1000);",
      path,
    ],
    { stdio: ["ignore", "pipe", "pipe"] },
  );
  await new Promise((done, reject) => {
    child.stdout.once("data", done);
    child.once("error", reject);
  });
  try {
    const before = await snapshot(root);
    const result = await inspect(root);
    expect(result.kind).toBe("operation");
    expect(result.reason).toContain("locked");
    expect(await snapshot(root)).toEqual(before);
  } finally {
    child.kill("SIGKILL");
    await new Promise((done) => child.once("close", done));
  }
});

test("concurrent readers of a live WAL database preserve content and all sidecar bytes", async () => {
  const root = await directory();
  const path = join(root, "db.sqlite");
  const db = database(path);
  db.exec("pragma journal_mode=WAL");
  db.exec("insert into preserved values ('second-value')");
  // Establish the ordinary reader mark before comparing all persisted bytes.
  const reader = new DatabaseSync(path, { readOnly: true });
  reader.prepare("select * from preserved").all();
  try {
    const before = await snapshot(root);
    const results = await Promise.all([inspect(root), inspect(root)]);
    expect(results.map((item) => item.kind)).toEqual(["operation", "operation"]);
    expect(await snapshot(root)).toEqual(before);
    expect(db.prepare("select count(*) as count from preserved").get().count).toBe(2);
  } finally {
    reader.close();
    db.close();
  }
  const before = await snapshot(root);
  const result = await inspect(root);
  expect(result.kind).toBe("operation");
  expect(result.reason).toContain("sidecars");
  expect(await snapshot(root)).toEqual(before);
});
