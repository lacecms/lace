import { readFile, readlink, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { fork } from "node:child_process";
import { watch, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { FixedCommandBuilder } from "../dist/index.js";
import { builderFixture } from "./test-support/builder-harness.ts";

const cleanup = [];
afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((item) => item()));
});
const fixture = (extra = {}) => builderFixture(FixedCommandBuilder, cleanup, extra);

test("killed fixed-command build preserves the complete current release until corrected retry", async () => {
  const { builder, root, source, tool } = await fixture();
  expect(await builder.build({ buildId: "baseline", targetVersion: 1 })).toEqual({
    status: "succeeded",
  });
  const output = join(root, "output");
  const previous = await readlink(join(output, "current"));
  const pause = join(root, "pause");
  const checkpoint = join(root, "partial-ready");
  await writeFile(pause, "1");
  await writeFile(
    tool,
    `#!${process.execPath}
const fs = await import('node:fs/promises');
const {existsSync} = await import('node:fs');
if (process.argv[2] === 'install') {await fs.mkdir('apps/site/node_modules/astro', {recursive:true});}
else {await fs.mkdir('apps/site/dist', {recursive:true}); await fs.writeFile('apps/site/dist/index.html', '<h1>new complete release</h1>');
if (existsSync(${JSON.stringify(pause)})) {await fs.writeFile(${JSON.stringify(checkpoint)}, 'partial-output-written'); await new Promise(() => setInterval(() => {}, 1000));}}
`,
  );
  const settings = {
    sourceRoot: source,
    siteDirectory: "apps/site",
    outputDirectory: "dist",
    workRoot: join(root, "work"),
    outputRoot: output,
    apiBaseUrl: "http://api.test/",
    buildToken: "private-build-token",
    toolPath: tool,
  };
  const children = [];
  const start = () => {
    const child = fork(
      fileURLToPath(new URL("../../../tests/support/builder-child.mjs", import.meta.url)),
      [JSON.stringify({ settings, version: 2 })],
      { detached: true, execArgv: [], stdio: ["ignore", "ignore", "ignore", "ipc"] },
    );
    const exited = new Promise((done) =>
      child.once("exit", (code, signal) => done({ code, signal })),
    );
    const result = new Promise((done, reject) => {
      child.once("message", done);
      child.once("error", reject);
      child.once("exit", () => reject(new Error("Builder child exited before result")));
    });
    // An interrupted child intentionally produces no result.
    result.catch(() => {});
    const value = { child, exited, result };
    children.push(value);
    return value;
  };
  const served = createServer(async (_request, response) => {
    response.end(await readFile(join(output, "current/index.html"), "utf8"));
  });
  await new Promise((done) => served.listen(0, "127.0.0.1", done));
  const servedUrl = `http://127.0.0.1:${served.address().port}`;
  let watcher;
  try {
    const ready = new Promise((done) => {
      watcher = watch(root, () => {
        if (existsSync(checkpoint)) done();
      });
    });
    const interrupted = start();
    await ready;
    watcher.close();
    process.kill(-interrupted.child.pid, "SIGKILL");
    expect((await interrupted.exited).signal).toBe("SIGKILL");
    expect(await readlink(join(output, "current"))).toBe(previous);
    expect(await readFile(join(output, "current/index.html"), "utf8")).toContain("<h1>ok</h1>");
    expect(await (await fetch(servedUrl)).text()).toContain("<h1>ok</h1>");
    await rm(pause);
    const retry = start();
    expect(await retry.result).toEqual({ status: "succeeded" });
    expect((await retry.exited).code).toBe(0);
    expect(await (await fetch(servedUrl)).text()).toBe("<h1>new complete release</h1>");
    expect(await readlink(join(output, "current"))).not.toBe(previous);
    expect(await readFile(join(output, "current/index.html"), "utf8")).toBe(
      "<h1>new complete release</h1>",
    );
    expect(await readFile(join(output, previous, "index.html"), "utf8")).toContain("<h1>ok</h1>");
  } finally {
    watcher?.close();
    await new Promise((done) => {
      served.closeAllConnections();
      served.close(done);
    });
    await stopChildren(children);
  }
}, 30000);

async function stopChildren(children) {
  for (const value of children) {
    try {
      process.kill(-value.child.pid, "SIGKILL");
    } catch (error) {
      if (error.code !== "ESRCH") throw error;
    }
    await value.exited;
  }
}
