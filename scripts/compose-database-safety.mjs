import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { generateProject } from "../packages/create-lace/dist/index.js";

const execute = promisify(execFile);
const workspace = resolve(import.meta.dirname, "..");
const cli = join(workspace, "packages/cli/dist/bin.js");

/** Source guard verification; image identities are explicit and are not candidate acceptance. */
export async function composeDatabaseSafety() {
  const api = process.env.LACE_34B_API_IMAGE;
  const builder = process.env.LACE_34B_BUILDER_IMAGE;
  assert.ok(
    api && builder,
    "Set LACE_34B_API_IMAGE and LACE_34B_BUILDER_IMAGE to local fixture images",
  );
  const parent = await mkdtemp(join(tmpdir(), "lace-34b-compose-"));
  const project = `lace34b${randomUUID().replaceAll("-", "")}`;
  const root = join(parent, "consumer");
  const interruption = new AbortController();
  let cleaning = false;
  const stop = () => interruption.abort();
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  const run = async (command, args, options = {}) => {
    try {
      return await execute(command, args, {
        ...(cleaning ? {} : { signal: interruption.signal }),
        cwd: root,
        timeout: 120000,
        maxBuffer: 1024 * 1024,
        ...options,
      });
    } catch {
      // Child output may contain credentials; report only the owned phase.
      throw new Error(`34B Compose command failed: ${command} ${args.slice(0, 2).join(" ")}`);
    }
  };
  const compose = (...args) => run("docker", ["compose", "--project-name", project, ...args]);
  const host = async (args, status = 0) => {
    let result;
    try {
      result = await execute(
        process.execPath,
        [...(args[0] === "env" ? [] : ["--env-file=.env"]), cli, ...args, "--json"],
        {
          ...(cleaning ? {} : { signal: interruption.signal }),
          cwd: root,
          timeout: 20000,
        },
      );
      assert.equal(status, 0, "Host command unexpectedly succeeded");
    } catch (error) {
      assert.equal(error.code, status, "Unexpected host command exit code");
      result = error;
    }
    assert.equal(result.stderr, "");
    const body = JSON.parse(result.stdout);
    assert.equal(body.ok, status === 0);
    return body;
  };
  const snapshot = async () => {
    const { stdout } = await compose(
      "exec",
      "-T",
      "api",
      "node",
      "--input-type=module",
      "-e",
      "import {DatabaseSync} from 'node:sqlite'; const db=new DatabaseSync('/data/lace.sqlite'); console.log(JSON.stringify(['setup_tokens','content_entries','content_snapshots','api_tokens','user'].map(t=>[t,db.prepare('select * from '+t).all()]))); db.close();",
    );
    return JSON.parse(stdout);
  };
  let taggedMinio = false;
  try {
    await generateProject({ target: root, site: { mode: "none" } });
    await symlink(join(workspace, "node_modules"), join(root, "node_modules"), "dir");
    await host(["env", "prepare"]);
    const secret = randomBytes(32).toString("hex");
    const reservation = createServer();
    await new Promise((done) => reservation.listen(0, "127.0.0.1", done));
    const port = reservation.address().port;
    await new Promise((done) => reservation.close(done));
    const base = `http://127.0.0.1:${port}`;
    // The source fixture uses a separately allocated loopback port.
    await writeFile(
      join(root, ".env"),
      [
        `LACE_API_IMAGE=${api}`,
        `LACE_BUILDER_IMAGE=${builder}`,
        `LACE_AUTH_SECRET=${secret}`,
        "LACE_DATABASE_PATH=./.lace/data/lace.sqlite",
        `LACE_PUBLIC_BASE_URL=${base}/`,
        `LACE_API_PORT=127.0.0.1:${port}`,
        `LACE_MINIO_ROOT_ACCESS_KEY=${randomBytes(12).toString("hex")}`,
        `LACE_MINIO_ROOT_SECRET=${randomBytes(32).toString("hex")}`,
        `LACE_BUILDER_SECRET=${randomBytes(32).toString("hex")}`,
        "",
      ].join("\n"),
    );
    if (process.env.LACE_34B_MINIO_IMAGE) {
      await run("docker", ["tag", process.env.LACE_34B_MINIO_IMAGE, `${project}-minio`]);
      taggedMinio = true;
    } else await compose("build", "minio");
    await host(["db", "migrate"]);
    await host(["content", "sync"]);
    await compose("up", "-d", "--wait", "api", "dispatcher");
    const before = await snapshot();
    for (const args of [
      ["db", "migrate"],
      ["content", "sync"],
      ["content", "sync", "--check"],
      ["auth", "bootstrap"],
    ]) {
      const refusal = await host(args, 6);
      assert.equal(refusal.code, "OPERATION_FAILED");
      assert.match(refusal.reason, /running Compose/u);
      assert.match(refusal.nextAction, /Stop api and dispatcher/u);
      assert.equal(refusal.data?.token, undefined);
      assert.deepEqual(await snapshot(), before, "Denied command changed persisted state");
    }
    await compose("stop", "api", "dispatcher");
    for (const args of [
      ["db", "migrate"],
      ["content", "sync"],
      ["content", "sync", "--check"],
    ])
      await host(args);
    const bootstrap = await host(["auth", "bootstrap"]);
    assert.equal(typeof bootstrap.data.token, "string");
    await compose("up", "-d", "--wait", "api", "dispatcher");
    const call = async (path, json, cookie) => {
      const response = await fetch(base + path, {
        method: json === undefined ? "GET" : "POST",
        headers: {
          origin: base,
          "content-type": "application/json",
          ...(cookie ? { cookie } : {}),
        },
        ...(json === undefined ? {} : { body: JSON.stringify(json) }),
        signal: AbortSignal.timeout(10000),
      });
      assert.ok(response.ok, `Compose API status ${response.status} at ${path}`);
      return response;
    };
    const password = randomBytes(24).toString("hex");
    await call("/api/v1/setup/admin", {
      token: bootstrap.data.token,
      email: "compose@34b.test",
      password,
    });
    const login = await call("/api/auth/sign-in/email", { email: "compose@34b.test", password });
    const cookie = login.headers
      .getSetCookie()
      .map((value) => value.split(";")[0])
      .join("; ");
    const entry = await (
      await call(
        "/api/v1/admin/models/posts/entries",
        { slug: "retained", title: "34B retained content", fields: {}, blocks: [] },
        cookie,
      )
    ).json();
    await compose("stop", "api", "dispatcher");
    await host(["content", "sync", "--check"]);
    await compose("up", "-d", "--wait", "api", "dispatcher");
    const retained = await (
      await call(`/api/v1/admin/entries/${entry.id}`, undefined, cookie)
    ).json();
    assert.equal(retained.draft.title, "34B retained content");
    console.info(
      "34B Compose: four commands denied without state/token changes; stopped maintenance and restart persistence passed",
    );
    return {
      status: "passed",
      apiImage: api,
      builderImage: builder,
      commandsDenied: 4,
      persistedEntry: true,
    };
  } finally {
    cleaning = true;
    process.removeListener("SIGINT", stop);
    process.removeListener("SIGTERM", stop);
    await compose("down", "--volumes", "--remove-orphans");
    if (taggedMinio) await run("docker", ["image", "rm", `${project}-minio`]);
    await rm(parent, { recursive: true, force: true });
  }
}

if (process.argv[1] === import.meta.filename) await composeDatabaseSafety();
