import { execFile } from "node:child_process";
import { createHmac, randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { Readable } from "node:stream";
import { promisify } from "node:util";
import { editor, admin, openPreviewSession } from "@lacecms/test-utils";
import { expect, test } from "vitest";
import {
  localS3PreviewFixture,
  nodePreviewFixture,
} from "../packages/platform-node/src/test-support/preview-fixture.ts";
import { previewWorkspace } from "./support/preview-astro-fixture.mjs";

const exec = promisify(execFile);
const docker = async (...args) => (await exec("docker", args, { timeout: 45000 })).stdout.trim();

test("the fixed container builds private snapshots and resumes normal publication", async () => {
  const endpoint = process.env.LACE_TEST_PREVIEW_S3_URL;
  const image = process.env.LACE_TEST_PREVIEW_BUILDER_IMAGE;
  if (!endpoint || !image)
    throw new Error("A local S3 endpoint and the checked-out builder image are required.");
  const cleanups = [];
  let deniedUploads = 0;
  let uploadAttempts = 0;
  let failUpload = false;
  let blockInput = false;
  let inputArrived;
  let releaseInput;
  let scopedClaim;
  let runtime;
  const runnerResponses = [];
  const api = createServer(async (incoming, outgoing) => {
    const target = incoming.url ?? "/";
    const headers = incoming.headers;
    if (target.match(/\/artifacts\/files\//u) && failUpload && ++uploadAttempts === 2) {
      deniedUploads++;
      incoming.resume();
      return outgoing.writeHead(503).end();
    }
    try {
      if (target.endsWith("/input") && blockInput) {
        scopedClaim = headers.authorization;
        inputArrived();
        await releaseInput;
      }
      const method = incoming.method;
      const body = method === "GET" || method === "HEAD" ? undefined : Readable.toWeb(incoming);
      const request = new Request(`http://${headers.host}${target}`, {
        method,
        headers,
        ...(body && { body, duplex: "half" }),
      });
      runtime.setRequestPeer(request, "127.0.0.1", target);
      const result = await runtime.app.fetch(request);
      if (target.includes("/preview-runner/"))
        runnerResponses.push([method, target, result.status]);
      outgoing.writeHead(result.status, Object.fromEntries(result.headers));
      outgoing.end(Buffer.from(await result.arrayBuffer()));
    } catch {
      outgoing.writeHead(503).end();
    }
  });
  try {
    await new Promise((resolve, reject) => api.once("error", reject).listen(0, "0.0.0.0", resolve));
    cleanups.push(
      () =>
        new Promise((resolve) => {
          api.closeAllConnections();
          api.close(resolve);
        }),
    );
    const runnerOrigin = `http://host.docker.internal:${api.address().port}/`;
    const workspace = await previewWorkspace();
    cleanups.push(workspace.cleanup);
    const source = await workspace.containerSite();
    const commit = (await exec("git", ["rev-parse", "HEAD"], { cwd: source })).stdout.trim();
    const { bucket } = await localS3PreviewFixture(cleanups, endpoint);
    const name = `lace-preview-vps-${randomUUID()}`;
    const builderSecret = randomUUID();
    const bootstrapSecret = randomUUID();
    const publicationSecret = randomUUID();
    cleanups.push(() => docker("rm", "-f", name).catch(() => undefined));
    // The API needs the builder origin before it issues the public-build token.
    const originProbe = createServer();
    await new Promise((resolve, reject) =>
      originProbe.once("error", reject).listen(0, "127.0.0.1", resolve),
    );
    const port = originProbe.address().port;
    await new Promise((resolve) => originProbe.close(resolve));
    const builderOrigin = `http://127.0.0.1:${port}/`;
    const previewOrigin = "https://preview.lace.test";
    const siteUrl = "https://published.example/journal/";
    const fixture = await nodePreviewFixture(cleanups, {
      endpoint,
      bucket,
      preview: previewOrigin,
      runnerEnvironment: {
        LACE_PREVIEW_ENABLED: "true",
        LACE_PREVIEW_ORIGIN: previewOrigin,
        LACE_PREVIEW_RUNNER_ORIGIN: runnerOrigin,
        LACE_PREVIEW_BUILDER_URL: builderOrigin,
        LACE_PREVIEW_BUILDER_SECRET: builderSecret,
        LACE_PREVIEW_RUNNER_SECRET: bootstrapSecret,
        LACE_BUILD_SITE_ID: "main-site",
        LACE_BUILD_SITE_LABEL: "Main site",
        LACE_BUILD_SITE_URL: siteUrl,
      },
    });
    ({ runtime } = fixture);
    const build = await runtime.security.createBuildToken({ name: "VPS test", now: Date.now() });
    const environment = {
      LACE_API_BASE_URL: runnerOrigin,
      LACE_BUILDER_SECRET: publicationSecret,
      LACE_BUILD_TOKEN: build.token,
      LACE_BUILD_SITE_DIR: ".",
      LACE_BUILD_SITE_URL: siteUrl,
      LACE_PREVIEW_ENABLED: "true",
      LACE_PREVIEW_BUILDER_SECRET: builderSecret,
      LACE_PREVIEW_RUNNER_SECRET: bootstrapSecret,
    };
    await exec(
      "docker",
      [
        "run",
        "-d",
        "--name",
        name,
        "-p",
        `127.0.0.1:${port}:8788`,
        "--add-host",
        "host.docker.internal:host-gateway",
        "-v",
        `${source}:/source:ro`,
        ...Object.keys(environment).flatMap((key) => ["--env", key]),
        image,
      ],
      { env: { ...process.env, ...environment }, timeout: 45000 },
    );
    await expect.poll(async () => (await fetch(new URL("health", builderOrigin))).status).toBe(200);
    const publishBuild = (targetVersion) =>
      fetch(new URL("build", builderOrigin), {
        method: "POST",
        headers: {
          authorization: `Bearer ${publicationSecret}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ buildId: `publication-${targetVersion}`, targetVersion }),
      });
    const [model] = fixture.config.runtime.content;
    await fixture.run(
      `insert into content_models (key,kind,label,config_version,structure_hash,projection_hash,created_at,updated_at)
       values ('home','page','Home',1,?,?,1,1)`,
      [model.structureHash, model.projectionHash],
    );
    const draft = await runtime.content.create({
      actor: admin,
      modelKey: "home",
      title: "Public baseline",
      fields: {},
      blocks: [],
    });
    await runtime.content.publish({ actor: admin, entryId: draft.id, expectedRevision: 1 });
    const baselineBuild = await (await publishBuild(1)).json();
    expect(
      baselineBuild.status,
      `${JSON.stringify(baselineBuild)} ${await docker("logs", name)}`,
    ).toBe("succeeded");
    const originalRelease = await docker("exec", name, "readlink", "/output/current");
    expect(await docker("exec", name, "cat", "/output/current/index.html")).toContain(
      "Public baseline",
    );
    await runtime.content.save({
      actor: editor,
      entryId: draft.id,
      expectedRevision: 1,
      title: "Private saved title",
      fields: {},
      blocks: [],
    });
    const create = async (idempotencyKey) => {
      const result = await runtime.createPreview(editor, {
        entryId: draft.id,
        expectedRevision: 2,
        idempotencyKey,
      });
      expect(result).toMatchObject({
        kind: "admitted",
        generation: { source: { commit, executor: "vps" } },
      });
      return result.generation.id;
    };
    const status = () => runtime.repository.preview.currentPreview(draft.id, Date.now());
    const reconcile = async (id) => {
      const reservationId = createHmac("sha256", builderSecret)
        .update(`preview/${id}`)
        .digest("hex");
      const stopped = await fetch(new URL("preview", builderOrigin), {
        method: "DELETE",
        headers: { authorization: `Bearer ${builderSecret}`, "content-type": "application/json" },
        body: JSON.stringify({ generationId: id, reservationId }),
      });
      expect(stopped.status).toBe(200);
      expect(await runtime.repository.preview.confirmPreviewExecutorStopped(id, Date.now())).toBe(
        true,
      );
    };
    failUpload = true;
    const failed = await create("failed-upload");
    await expect
      .poll(status, { timeout: 75000 })
      .toMatchObject({ state: "failed", reason: "PREVIEW_STORAGE_FAILED" });
    const logs = () => exec("docker", ["logs", name]).then(({ stdout, stderr }) => stdout + stderr);
    expect(deniedUploads, `${JSON.stringify(runnerResponses)} ${await logs()}`).toBe(1);
    expect(await runtime.repository.preview.readyPreview(failed, Date.now())).toBeNull();
    const partial = await runtime.previewPackages.manifest(failed);
    expect(await runtime.previewPackages.exists(failed, partial.files[0])).toBe(true);
    expect(await runtime.previewPackages.exists(failed, partial.files[1])).toBe(false);
    expect(await docker("exec", name, "readlink", "/output/current")).toBe(originalRelease);
    await reconcile(failed);

    failUpload = false;
    blockInput = true;
    const blocked = Promise.withResolvers();
    const resume = Promise.withResolvers();
    inputArrived = blocked.resolve;
    releaseInput = resume.promise;
    cleanups.push(resume.resolve);
    const interrupted = await create("interrupted");
    await Promise.race([
      blocked.promise,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Runner never requested input")), 15000).unref(),
      ),
    ]);
    const restarted = await docker("restart", "-t", "1", name);
    expect(restarted).toBe(name);
    blockInput = false;
    resume.resolve();
    await fixture.run("update preview_generations set execution_deadline=? where id=?", [
      Date.now() - 1,
      interrupted,
    ]);
    expect(await runtime.repository.preview.settlePreviewDeadline(interrupted, Date.now())).toBe(
      true,
    );
    const late = await runtime.app.fetch(
      new Request(new URL(`api/v1/preview-runner/${interrupted}/input`, runnerOrigin), {
        headers: { authorization: scopedClaim },
      }),
    );
    expect(late.status).toBe(409);
    const lateUpload = await runtime.app.fetch(
      new Request(
        new URL(`api/v1/preview-runner/${interrupted}/artifacts/files/index.html`, runnerOrigin),
        {
          method: "PUT",
          body: "late",
          headers: { authorization: scopedClaim, "content-type": "application/octet-stream" },
        },
      ),
    );
    expect(lateUpload.status).toBe(409);
    await expect.poll(async () => (await fetch(new URL("health", builderOrigin))).status).toBe(200);
    expect(
      await runtime.createPreview(editor, {
        entryId: draft.id,
        expectedRevision: 2,
        idempotencyKey: "before-reconciliation",
      }),
    ).toMatchObject({ kind: "rejected", reason: "PREVIEW_BUSY" });
    await runtime.maintainOperations();
    expect(await runtime.repository.preview.previewExecutorToStop()).toBeNull();
    expect(await docker("exec", name, "ls", "-A", "/work")).toBe("");
    expect(await docker("exec", name, "readlink", "/output/current")).toBe(originalRelease);

    const ready = await create("succeeded-after-restart");
    await expect
      .poll(status, { timeout: 75000 })
      .toMatchObject({ id: ready, state: "ready", revision: 2 });
    const app = (request) => runtime.app.fetch(request);
    expect((await app(new Request(`${previewOrigin}/p/${ready}/`))).status).toBe(401);
    const cookie = await openPreviewSession(app, await fixture.signIn(), ready, previewOrigin);
    const response = await app(
      new Request(`${previewOrigin}/p/${ready}/`, { headers: { cookie } }),
    );
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("Private saved title");
    expect(await docker("exec", name, "readlink", "/output/current")).toBe(originalRelease);
    await runtime.content.publish({ actor: admin, entryId: draft.id, expectedRevision: 2 });
    expect(await (await publishBuild(2)).json()).toMatchObject({ status: "succeeded" });
    expect(await docker("exec", name, "cat", "/output/current/index.html")).toContain(
      "Private saved title",
    );
    expect(await docker("exec", name, "readlink", "/output/current")).not.toBe(originalRelease);
  } finally {
    for (const cleanup of cleanups.reverse()) await cleanup();
  }
});
