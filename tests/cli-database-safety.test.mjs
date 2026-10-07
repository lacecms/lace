import { assertSecretFree } from "../scripts/consumer-security.mjs";
import { expect, test } from "vitest";
import { mkdtemp, mkdir, rm, writeFile, chmod } from "node:fs/promises";
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

test("CLI refuses migration, sync/check and bootstrap before SQLite with sanitized output", async () => {
  const root = await mkdtemp(join(tmpdir(), "lace-cli-storage-"));
  try {
    await writeFile(join(root, "docker-compose.yml"), "services: {}\n");
    await mkdir(join(root, "bin"));
    const docker = join(root, "bin/docker");
    await writeFile(
      docker,
      `#!${process.execPath}\nconst result = process.argv[2] === "ps" ? "abcdef123456" : ${JSON.stringify(JSON.stringify({ running: true, service: "api", workingDirectory: "/opt/lace", databasePaths: ["LACE_DATABASE_PATH=/installation/data/lace.sqlite", null], mounts: [{ Type: "bind", Source: root, Destination: "/installation" }] }))};\nconsole.log(result);\n`,
    );
    await chmod(docker, 0o700);
    const binary = resolve("packages/cli/dist/bin.js");
    for (const args of [
      ["db", "migrate"],
      ["content", "sync"],
      ["content", "sync", "--check"],
      ["auth", "bootstrap"],
    ]) {
      for (const json of [true, false]) {
        const result = spawnSync(process.execPath, [binary, ...args, ...(json ? ["--json"] : [])], {
          cwd: root,
          encoding: "utf8",
          timeout: 10000,
          env: {
            ...process.env,
            LACE_DATABASE_PATH: join(root, "data/lace.sqlite"),
            PATH: `${join(root, "bin")}:${dirname(process.execPath)}:${process.env.PATH}`,
          },
        });
        expect(result.status).toBe(6);
        if (json) {
          expect(result.stderr).toBe("");
          expect(result.stdout.trim().split("\n")).toHaveLength(1);
          const parsed = JSON.parse(result.stdout);
          expect(parsed).toMatchObject({ ok: false, code: "OPERATION_FAILED" });
          expect(parsed.reason).toContain("running Compose");
          expect(parsed.nextAction).toContain("Stop api and dispatcher");
        } else {
          expect(result.stdout).toBe("");
          expect(result.stderr).toContain("Stop api and dispatcher");
        }
        expect(result.stdout + result.stderr).not.toContain(root);
        expect(existsSync(join(root, "data"))).toBe(false);
      }
    }
    // The same host migration succeeds while only the source-mounted builder remains.
    await writeFile(
      docker,
      `#!${process.execPath}\nconst result = process.argv[2] === "ps" ? "abcdef123456" : ${JSON.stringify(JSON.stringify({ running: true, service: "builder", workingDirectory: "/builder", databasePaths: [null], mounts: [{ Type: "bind", Source: root, Destination: "/source", RW: false }] }))};\nconsole.log(result);\n`,
    );
    const allowed = spawnSync(process.execPath, [binary, "db", "migrate", "--json"], {
      cwd: root,
      encoding: "utf8",
      timeout: 10000,
      env: {
        ...process.env,
        LACE_DATABASE_PATH: join(root, "data/lace.sqlite"),
        PATH: `${join(root, "bin")}:${dirname(process.execPath)}:${process.env.PATH}`,
      },
    });
    expect(allowed.status).toBe(0);
    expect(JSON.parse(allowed.stdout)).toMatchObject({ ok: true, code: "MIGRATED" });
    expect(existsSync(join(root, "data/lace.sqlite"))).toBe(true);
    const sentinel = "docker-inspection-credential-sentinel-34b";
    await writeFile(
      docker,
      `#!${process.execPath}\nconsole.error(${JSON.stringify(sentinel)}); process.exit(17);\n`,
    );
    const inspectionFailure = spawnSync(process.execPath, [binary, "auth", "bootstrap", "--json"], {
      cwd: root,
      encoding: "utf8",
      timeout: 10000,
      env: {
        ...process.env,
        LACE_DATABASE_PATH: join(root, "data/lace.sqlite"),
        PATH: `${join(root, "bin")}:${dirname(process.execPath)}:${process.env.PATH}`,
      },
    });
    expect(inspectionFailure.status).toBe(6);
    expect(JSON.parse(inspectionFailure.stdout).data?.token).toBeUndefined();
    assertSecretFree(
      inspectionFailure.stdout + inspectionFailure.stderr,
      [sentinel],
      "CLI Docker inspection error",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}, 30000);
