import { spawn, spawnSync } from "node:child_process";
import * as fs from "node:fs/promises";
import { join, resolve } from "node:path";
import { parseEnv } from "node:util";
import { expect, test } from "vitest";
import { directory } from "./upgrade-fixtures.mjs";
import { parseArguments } from "../dist/index.js";
import { describeFailure } from "../dist/diagnostics.js";
import { prepareEnvironment, renderEnvironment } from "../dist/environment.js";

const binary = resolve(import.meta.dirname, "../dist/bin.js");
const template = await fs.readFile(
  resolve(import.meta.dirname, "../../create-lace/templates/.env.example"),
  "utf8",
);
const names = [
  "LACE_AUTH_SECRET",
  "LACE_MINIO_ROOT_ACCESS_KEY",
  "LACE_MINIO_ROOT_SECRET",
  "LACE_BUILDER_SECRET",
];
const sentinel = "private-env-sentinel";

function invoke(cwd, args) {
  return spawnSync(process.execPath, [binary, "env", "prepare", ...args], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, LACE_DATABASE_PATH: "", LACE_AUTH_SECRET: sentinel },
  });
}

test("preparation accepts only local arguments and bypasses environment loading", async () => {
  expect(parseArguments(["env", "prepare", "--json"]).command).toBe("env prepare");
  const root = await directory();
  for (const args of [
    ["--target", "node"],
    ["--target", "cloudflare-remote"],
    ["--check"],
    [sentinel],
    ["--json", "--json"],
  ]) {
    const result = invoke(root, [...args, ...(args.includes("--json") ? [] : ["--json"])]);
    expect(result.status).toBe(3);
    expect(result.stderr).toBe("");
    expect(JSON.parse(result.stdout)).toMatchObject({ code: "USAGE", operation: "env prepare" });
    expect(result.stdout).not.toContain(sentinel);
  }
  for (const json of [false, true]) {
    const result = invoke(root, json ? ["--json"] : []);
    expect(result.status).toBe(4);
    const text = result.stdout + result.stderr;
    expect(text).toContain(json ? '"operation":"env prepare"' : "Operation: env prepare");
    expect(text).toContain(".env.example");
    expect(text).not.toContain(sentinel);
    if (json)
      expect(JSON.parse(result.stdout)).toMatchObject({
        code: "CONFIG",
        nextAction: expect.any(String),
      });
  }
  expect(await fs.readdir(root)).toEqual([]);
});

function checkSettings(content, original = template) {
  const values = parseEnv(content);
  for (const [key, value] of Object.entries(parseEnv(original))) {
    if (!names.includes(key) && key !== "LACE_BUILD_TOKEN") expect(values[key]).toBe(value);
  }
  for (const name of names)
    expect(values[name]).toMatch(
      name === "LACE_MINIO_ROOT_ACCESS_KEY" ? /^[A-Za-z0-9]{20}$/u : /^[a-f0-9]{64}$/u,
    );
  expect(new Set(names.map((name) => values[name])).size).toBe(4);
  expect(values.LACE_BUILD_TOKEN).toBe("");
  return values;
}

test("rendering preserves unrelated bytes and line endings and creates independent credentials", () => {
  const example =
    `${template}\nCUSTOM="literal $(echo nope)"\nMULTILINE="first\nsecond"\n`.replaceAll(
      "\n",
      "\r\n",
    );
  const left = renderEnvironment(example);
  const right = renderEnvironment(example);
  const values = checkSettings(left, example);
  for (const name of names) expect(values[name]).not.toBe(parseEnv(right)[name]);
  const withoutCredentials = (text) =>
    text.replace(
      /^(LACE_(?:AUTH_SECRET|MINIO_ROOT_ACCESS_KEY|MINIO_ROOT_SECRET|BUILDER_SECRET|BUILD_TOKEN))=.*$/gmu,
      "$1=",
    );
  expect(withoutCredentials(left)).toBe(withoutCredentials(example));
  expect(left).toContain('CUSTOM="literal $(echo nope)"');
});

test("ambiguous, missing and multiline controlled assignments fail without publication", async () => {
  for (const invalid of [
    template.replace("LACE_AUTH_SECRET=", ""),
    `${template}LACE_AUTH_SECRET=duplicate\n`,
    template.replace("LACE_AUTH_SECRET=", 'LACE_AUTH_SECRET="first\nsecond"'),
    template.replace("LACE_BUILD_TOKEN=", "# LACE_BUILD_TOKEN="),
  ]) {
    const root = await directory();
    await fs.writeFile(join(root, ".env.example"), invalid);
    await expect(prepareEnvironment(root)).rejects.toMatchObject({ code: "CONFIG" });
    expect(await fs.readdir(root)).toEqual([".env.example"]);
  }
});

test("template symlinks and nonregular files are rejected", async () => {
  for (const type of ["link", "directory", "fifo"]) {
    const root = await directory();
    const target = join(root, ".env.example");
    if (type === "link") await fs.symlink("missing", target);
    else if (type === "directory") await fs.mkdir(target);
    else expect(spawnSync("mkfifo", [target]).status).toBe(0);
    const result = invoke(root, ["--json"]);
    expect(result.status).toBe(4);
    expect(JSON.parse(result.stdout).code).toBe("CONFIG");
    expect(await fs.readdir(root)).toEqual([".env.example"]);
  }
});

test("success creates protected complete output and never prints credentials in either mode", async () => {
  for (const json of [false, true]) {
    const root = await directory();
    await fs.writeFile(join(root, ".env.example"), template);
    const result = invoke(root, json ? ["--json"] : []);
    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    if (json) expect(JSON.parse(result.stdout)).toMatchObject({ ok: true, code: "ENV_PREPARED" });
    const values = checkSettings(await fs.readFile(join(root, ".env"), "utf8"));
    for (const name of names) expect(result.stdout).not.toContain(values[name]);
    expect(result.stdout).not.toContain(sentinel);
    expect((await fs.stat(join(root, ".env"))).mode & 0o777).toBe(0o600);
    expect((await fs.readdir(root)).sort()).toEqual([".env", ".env.example"]);
  }
});

test("existing files, empty files, directories and symlinks survive refusal in both modes", async () => {
  for (const kind of ["file", "empty", "directory", "symlink", "dangling"]) {
    const root = await directory();
    const destination = join(root, ".env");
    await fs.writeFile(join(root, ".env.example"), template);
    if (kind === "file" || kind === "empty")
      await fs.writeFile(destination, kind === "file" ? sentinel : "");
    else if (kind === "directory") await fs.mkdir(destination);
    else {
      if (kind === "symlink") await fs.writeFile(join(root, "original"), sentinel);
      await fs.symlink("original", destination);
    }
    const before = await fs.lstat(destination);
    for (const json of [false, true]) {
      const result = invoke(root, json ? ["--json"] : []);
      expect(result.status).toBe(6);
      const output = result.stdout + result.stderr;
      expect(output).not.toContain(sentinel);
      expect(output).toContain("existing .env");
      if (json)
        expect(JSON.parse(result.stdout)).toMatchObject({
          code: "OPERATION_FAILED",
          operation: "env prepare",
        });
      expect((await fs.lstat(destination)).ino).toBe(before.ino);
    }
    if (kind === "file" || kind === "empty")
      expect(await fs.readFile(destination, "utf8")).toBe(kind === "file" ? sentinel : "");
    if (kind === "symlink")
      expect(await fs.readFile(join(root, "original"), "utf8")).toBe(sentinel);
    if (kind === "symlink" || kind === "dangling")
      expect(await fs.readlink(destination)).toBe("original");
  }
});

test("real concurrent processes publish exactly one complete environment", async () => {
  const root = await directory();
  await fs.writeFile(join(root, ".env.example"), template);
  const run = () =>
    new Promise((resolveResult, reject) => {
      const child = spawn(process.execPath, [binary, "env", "prepare", "--json"], { cwd: root });
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (value) => {
        stdout += value;
      });
      child.stderr.on("data", (value) => {
        stderr += value;
      });
      child.on("error", reject);
      child.on("close", (status) => resolveResult({ status, stdout, stderr }));
    });
  const results = await Promise.all([run(), run()]);
  expect(results.map((result) => result.status).sort()).toEqual([0, 6]);
  const values = checkSettings(await fs.readFile(join(root, ".env"), "utf8"));
  for (const result of results) {
    expect(result.stderr).toBe("");
    expect(JSON.parse(result.stdout).ok).toBe(result.status === 0);
    for (const name of names) expect(result.stdout).not.toContain(values[name]);
  }
  expect((await fs.stat(join(root, ".env"))).mode & 0o777).toBe(0o600);
  expect((await fs.readdir(root)).sort()).toEqual([".env", ".env.example"]);
});

test("write, sync and publication failures clean staging and expose no partial destination", async () => {
  for (const phase of ["write", "sync", "link", "permission"]) {
    const root = await directory();
    await fs.writeFile(join(root, ".env.example"), template);
    const failure = Object.assign(new Error(sentinel), {
      code: phase === "permission" ? "EACCES" : "EIO",
    });
    const io = {
      ...fs,
      open: async (...args) => {
        if (phase === "permission") throw failure;
        const file = await fs.open(...args);
        if (args[1] === "wx") {
          if (phase === "write")
            file.writeFile = async () => {
              await file.write(sentinel);
              throw failure;
            };
          if (phase === "sync")
            file.sync = async () => {
              throw failure;
            };
        }
        return file;
      },
      link: async (...args) => {
        await expect(fs.lstat(join(root, ".env"))).rejects.toMatchObject({ code: "ENOENT" });
        if (phase === "link") throw failure;
        return fs.link(...args);
      },
    };
    let caught;
    try {
      await prepareEnvironment(root, io);
    } catch (error) {
      caught = error;
    }
    expect(describeFailure(caught, "env prepare")).toMatchObject({
      code: "OPERATION_FAILED",
      exitCode: 6,
      operation: "env prepare",
    });
    expect(JSON.stringify(describeFailure(caught, "env prepare"))).not.toContain(sentinel);
    expect(await fs.readdir(root)).toEqual([".env.example"]);
  }
});

test("a destination created after inspection wins without replacement", async () => {
  const root = await directory();
  await fs.writeFile(join(root, ".env.example"), template);
  await expect(
    prepareEnvironment(root, {
      ...fs,
      link: async (...args) => {
        await fs.writeFile(join(root, ".env"), sentinel, { flag: "wx" });
        return fs.link(...args);
      },
    }),
  ).rejects.toMatchObject({ diagnosticKind: "env-exists" });
  expect(await fs.readFile(join(root, ".env"), "utf8")).toBe(sentinel);
  expect((await fs.readdir(root)).sort()).toEqual([".env", ".env.example"]);
});

test("real permission failures are sanitized in human and JSON modes", async () => {
  const root = await directory();
  await fs.writeFile(join(root, ".env.example"), template);
  await fs.chmod(root, 0o500);
  try {
    for (const json of [false, true]) {
      const result = invoke(root, json ? ["--json"] : []);
      expect(result.status).toBe(6);
      expect(result.stdout + result.stderr).toContain("permissions");
      expect(result.stdout + result.stderr).not.toContain(root);
      if (json)
        expect(JSON.parse(result.stdout)).toMatchObject({
          code: "OPERATION_FAILED",
          operation: "env prepare",
        });
    }
    expect(await fs.readdir(root)).toEqual([".env.example"]);
  } finally {
    await fs.chmod(root, 0o700);
  }
});

test("termination before publication leaves only protected ignored staging", async () => {
  const root = await directory();
  await fs.writeFile(join(root, ".env.example"), template);
  const source = `import * as fs from 'node:fs/promises';
    import {prepareEnvironment} from ${JSON.stringify(new URL("../dist/environment.js", import.meta.url).href)};
    await prepareEnvironment(process.cwd(), { ...fs, link: async () => { process.kill(process.pid, 'SIGKILL'); } });`;
  const result = spawnSync(process.execPath, ["--input-type=module", "-e", source], {
    cwd: root,
    encoding: "utf8",
  });
  expect(result.signal).toBe("SIGKILL");
  expect(result.stdout + result.stderr).toBe("");
  await expect(fs.lstat(join(root, ".env"))).rejects.toMatchObject({ code: "ENOENT" });
  const [stage] = (await fs.readdir(root)).filter((name) => name.startsWith(".lace-env-"));
  expect(stage).toBeDefined();
  expect((await fs.stat(join(root, stage))).mode & 0o777).toBe(0o700);
  expect((await fs.stat(join(root, stage, "prepared"))).mode & 0o777).toBe(0o600);
  await fs.rm(join(root, stage), { recursive: true });
  await prepareEnvironment(root);
  checkSettings(await fs.readFile(join(root, ".env"), "utf8"));
});

const workerTemplate = await fs.readFile(
  resolve(import.meta.dirname, "../../create-lace/templates/worker/.dev.vars.example"),
  "utf8",
);

test("cloudflare-local preparation creates protected local Worker variables only", async () => {
  expect(parseArguments(["env", "prepare", "--target", "cloudflare-local"]).target).toBe(
    "cloudflare-local",
  );
  for (const json of [false, true]) {
    const root = await directory();
    await fs.mkdir(join(root, "worker"));
    await fs.writeFile(join(root, "worker/.dev.vars.example"), workerTemplate);
    const result = invoke(root, ["--target", "cloudflare-local", ...(json ? ["--json"] : [])]);
    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("worker/.dev.vars");
    const content = await fs.readFile(join(root, "worker/.dev.vars"), "utf8");
    const values = parseEnv(content);
    expect(values.LACE_AUTH_SECRET).toMatch(/^[a-f0-9]{64}$/u);
    expect(values.LACE_ENVIRONMENT).toBe("development");
    expect(values.LACE_PUBLIC_BASE_URL).toBe("http://127.0.0.1:8787/");
    expect(content.replace(/^LACE_AUTH_SECRET=.*$/mu, "LACE_AUTH_SECRET=")).toBe(workerTemplate);
    expect(result.stdout).not.toContain(values.LACE_AUTH_SECRET);
    expect(result.stdout).not.toContain(sentinel);
    expect((await fs.stat(join(root, "worker/.dev.vars"))).mode & 0o777).toBe(0o600);
    expect((await fs.readdir(root)).sort()).toEqual(["worker"]);
    const repeated = invoke(root, ["--target", "cloudflare-local", "--json"]);
    expect(repeated.status).toBe(6);
    expect(JSON.parse(repeated.stdout)).toMatchObject({
      code: "OPERATION_FAILED",
      operation: "env prepare",
    });
    expect(repeated.stdout).toContain("worker/.dev.vars");
    expect(await fs.readFile(join(root, "worker/.dev.vars"), "utf8")).toBe(content);
  }
});

test("cloudflare-local preparation rejects a missing or ambiguous Worker template", async () => {
  for (const invalid of [
    undefined,
    "LACE_ENVIRONMENT=development\n",
    `${workerTemplate}LACE_AUTH_SECRET=x\n`,
  ]) {
    const root = await directory();
    await fs.mkdir(join(root, "worker"));
    if (invalid !== undefined) await fs.writeFile(join(root, "worker/.dev.vars.example"), invalid);
    const result = invoke(root, ["--target", "cloudflare-local", "--json"]);
    expect(result.status).toBe(4);
    const failure = JSON.parse(result.stdout);
    expect(failure).toMatchObject({ code: "CONFIG", operation: "env prepare" });
    expect(failure.nextAction).toContain("worker/.dev.vars.example");
    await expect(fs.lstat(join(root, "worker/.dev.vars"))).rejects.toMatchObject({
      code: "ENOENT",
    });
  }
});
