import { randomBytes } from "node:crypto";
import { mkdtemp, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { beforeAll, expect, test } from "vitest";
import { openPreviewSession, readCompleteBuildExport } from "../packages/test-utils/dist/index.js";
import { exec, bootstrapSecret } from "./support/packed-preview-platforms.mjs";
import { runLocalPreviewWorkflow } from "./support/packed-preview-runner.mjs";
import { generatedNodePreview } from "./support/preview-deployment-node.mjs";
import { generatedWorkerPreview } from "./support/preview-deployment-worker.mjs";
import { sharp } from "./support/preview-astro-fixture.mjs";

const project = process.env.LACE_VERIFY_PREVIEW_DEPLOYMENTS_ROOT
  ? resolve(process.env.LACE_VERIFY_PREVIEW_DEPLOYMENTS_ROOT)
  : undefined;
let commit;
beforeAll(async () => {
  if (!project) throw new Error("Run pnpm acceptance:draft-preview");
  const git = (...args) => exec("git", args, { cwd: project });
  await git("init", "--quiet");
  await git("add", "--all");
  if ((await git("status", "--porcelain")).stdout.trim())
    await git(
      "-c",
      "user.name=Lace",
      "-c",
      "user.email=lace@example.test",
      "commit",
      "-qm",
      "Generated preview entry points",
    );
  commit = (await git("rev-parse", "HEAD")).stdout.trim();
});

async function json(response, status) {
  const body = await response.text();
  expect(response.status, body.slice(0, 700)).toBe(status);
  return JSON.parse(body);
}

async function verifyPreview(kind, platform, scratch) {
  let origin = platform.initialOrigin;
  let cookie;
  const email = "preview-operator@lace.test";
  const password = randomBytes(24).toString("base64url");
  const call = (path, { method = "GET", data, body, headers = {}, signedIn = true } = {}) =>
    platform.fetch(
      new Request(origin + path, {
        method,
        headers: {
          ...headers,
          ...(signedIn && cookie && { cookie }),
          ...(method === "GET" ? {} : { origin }),
          ...(data && { "content-type": "application/json" }),
        },
        ...(data ? { body: JSON.stringify(data) } : { body }),
      }),
    );
  const admin = (path, options) => call("/api/v1/admin" + path, options);
  const signIn = async () => {
    const response = await call("/api/auth/sign-in/email", {
      method: "POST",
      data: { email, password },
      signedIn: false,
    });
    await json(response, 200);
    cookie = response.headers
      .getSetCookie()
      .map((value) => value.split(";")[0])
      .join("; ");
  };
  await json(
    await call("/api/v1/setup/admin", {
      method: "POST",
      data: { email, password, token: await platform.setupToken() },
    }),
    201,
  );
  await signIn();
  expect(await json(await admin("/preview/config"), 200)).toEqual({
    ready: false,
    missing: ["preview-disabled"],
  });
  const build = await json(
    await admin("/api-tokens", {
      method: "POST",
      data: { name: "Generated preview public build" },
    }),
    201,
  );
  platform.buildToken?.(build.token);
  origin = await platform.configure("incomplete");
  await signIn();
  expect(await json(await admin("/preview/config"), 200)).toEqual({
    ready: false,
    missing: ["preview-configuration"],
  });
  expect((await platform.fetch(new Request(platform.previewOrigin + "/admin/"))).status).toBe(404);

  const homes = await json(await admin("/models/home/entries"), 200);
  const home = await json(await admin(`/entries/${homes.items[0].id}`), 200);
  await json(
    await admin(`/entries/${home.id}/publish`, {
      method: "POST",
      data: { expectedRevision: home.draft.revision },
      headers: { "idempotency-key": "publish-" + home.id },
    }),
    200,
  );
  const publicExport = () =>
    readCompleteBuildExport(
      (value, init) => platform.fetch(new Request(value, init)),
      origin + "/",
      build.token,
    );
  const published = await publicExport();
  const release = await platform.waitRelease?.();

  const image = await sharp({
    create: { width: 48, height: 32, channels: 3, background: "#642a88" },
  })
    .png()
    .toBuffer();
  const form = new FormData();
  form.append("file", new Blob([image], { type: "image/png" }), "draft-preview.png");
  const media = await json(await admin("/media", { method: "POST", body: form }), 201);
  const draft = await json(
    await admin("/models/posts/entries", {
      method: "POST",
      data: {
        title: "Generated deployment private draft",
        slug: "private-entrypoint",
        fields: {},
        blocks: [
          {
            key: "photo",
            type: "image",
            schemaVersion: 4,
            position: 1000,
            data: { media: media.id },
            settings: { lightbox: true },
          },
        ],
      },
    }),
    201,
  );
  const path = `/entries/${draft.id}/preview`;
  const createPreview = () =>
    admin(path, {
      method: "POST",
      data: { expectedRevision: draft.draft.revision, idempotencyKey: "standard-entrypoint" },
    });
  expect(await (await createPreview()).json()).toMatchObject({
    error: { code: "PREVIEW_CONFIGURATION_UNAVAILABLE" },
  });
  expect((await admin(path)).status).toBe(503);
  await platform.editorAccount(email);
  await signIn();
  expect(await json(await admin("/preview/config"), 200)).toEqual({ ready: false });

  origin = await platform.configure("on");
  expect(await json(await admin("/preview/config"), 200)).toMatchObject({
    ready: true,
    origin: platform.previewOrigin,
  });
  expect(await json(await admin(path), 200)).toBeNull();
  const preview = await json(await createPreview(), 202);

  const publications = platform.publications;
  if (kind === "worker")
    await runLocalPreviewWorkflow({
      project,
      scratch,
      platform,
      id: preview.id,
      intercept: (request, fetch) => fetch(request),
    });
  try {
    await expect
      .poll(
        async () => {
          const state = await json(await admin(path), 200);
          if (state?.state === "failed") throw new Error(`Preview failed: ${state.reason}`);
          return state?.state;
        },
        { timeout: 150_000, interval: 500 },
      )
      .toBe("ready");
  } catch (error) {
    if (platform.diagnostics) console.info((await platform.diagnostics()).slice(-3000));
    throw error;
  }
  await platform.reconcile?.();
  expect(await platform.previewCommit(preview.id)).toBe(commit);
  const previewCookie = await openPreviewSession(
    platform.fetch,
    cookie,
    preview.id,
    platform.previewOrigin,
  );
  const prefix = `${platform.previewOrigin}/p/${preview.id}/`;
  const privateAsset = prefix + `_lace_preview_media/${media.id}.png`;
  const resource = (url, session = "") =>
    platform.fetch(
      new Request(url, {
        headers: session ? { cookie: session } : {},
      }),
    );
  expect((await resource(privateAsset)).status).toBe(401);
  const artifact = await resource(prefix, previewCookie);
  expect(artifact.status).toBe(200);
  expect(await artifact.text()).toContain("Generated deployment private draft");
  const bytes = await resource(privateAsset, previewCookie);
  expect(Buffer.from(await bytes.arrayBuffer())).toEqual(image);
  expect(bytes.headers.get("cache-control")).toBe("private, no-store");
  expect(await publicExport()).toEqual(published);
  if (kind === "vps") expect(await platform.waitRelease()).toBe(release);

  origin = await platform.configure("off");
  expect((await resource(privateAsset, previewCookie)).status).toBe(404);
  expect((await resource(prefix, previewCookie)).status).toBe(404);
  expect((await resource(platform.previewOrigin + "/access/start", previewCookie)).status).toBe(
    404,
  );
  expect((await resource(platform.previewOrigin + "/admin/")).status).toBe(404);
  expect(
    await platform.privateRequest(`/api/v1/preview-runner/${preview.id}/claim`, undefined, {
      method: "POST",
      headers: { authorization: `Bearer ${bootstrapSecret}`, "content-type": "application/json" },
      body: JSON.stringify({ commit, runId: "1000" }),
    }),
  ).toBe(404);
  expect(await json(await admin("/preview/config"), 200)).toEqual({ ready: false });
  expect(await publicExport()).toEqual(published);
  if (kind === "vps") expect(await platform.waitRelease()).toBe(release);
  if (kind === "worker") expect(platform.publications).toBe(publications);
}

test.each(["node", "vps", "worker"])(
  "generated %s entry point activates and withdraws preview",
  async (kind) => {
    const scratch = await mkdtemp(join(tmpdir(), "lace-preview-entrypoint-"));
    const cleanups = [() => rm(scratch, { force: true, recursive: true })];
    try {
      if (kind === "worker") {
        await verifyPreview(
          kind,
          await generatedWorkerPreview({ project, commit, cleanups, scratch }),
          scratch,
        );
      } else {
        const checkout = join(scratch, "project");
        await exec("git", ["clone", "--quiet", "--no-hardlinks", project, checkout]);
        await symlink(join(project, "node_modules"), join(checkout, "node_modules"), "dir");
        const platform = await generatedNodePreview({
          project: checkout,
          cleanups,
          vps: kind === "vps",
          tlsDirectory: join(scratch, "tls"),
        });
        await verifyPreview(kind, platform, scratch);
      }
    } finally {
      for (const cleanup of cleanups.reverse()) await cleanup();
    }
  },
);
