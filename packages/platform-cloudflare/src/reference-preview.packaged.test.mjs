import { createRequire } from "node:module";
import { afterEach, expect, test } from "vitest";
import { gifFixture, readCompleteBuildExport } from "@lacecms/test-utils";
import { createCloudflareWorker } from "../dist/index.js";
import { createWorkerFixture, origin, secret } from "./test-support/worker-harness.ts";
import {
  checkReferencePreviewAdmission,
  previewCommit,
  previewEnvironment,
  referenceConfig,
  referencePreviewFixture,
} from "../../../tests/fixtures/reference-preview.mjs";
import { checkReferencePreviewRender } from "../../../tests/fixtures/reference-preview-render.mjs";

const cleanups = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

async function bundleWorker() {
  const api = createRequire(new URL("../../../apps/api/package.json", import.meta.url));
  const { build } = createRequire(api.resolve("wrangler/package.json"))("esbuild");
  const compiled = await build({
    stdin: {
      contents: `
        import { createCloudflareWorker } from "./packages/platform-cloudflare/src/runtime/worker.ts";
        import { referenceConfig } from "./tests/fixtures/reference-preview.mjs";
        const worker = createCloudflareWorker({ config: await referenceConfig() });
        export default { fetch(request, env, ctx) {
          // Miniflare's proxy rewrites Host to the address of its local listener.
          const headers = new Headers(request.headers);
          headers.set("host", new URL(request.url).host);
          return worker.fetch(new Request(request, { headers }), env, ctx);
        } };
      `,
      resolveDir: new URL("../../../", import.meta.url).pathname,
      loader: "ts",
    },
    bundle: true,
    write: false,
    format: "esm",
    platform: "browser",
    target: "es2022",
    conditions: ["@lacecms/source", "workerd", "worker", "browser"],
    external: ["node:*"],
  });
  return compiled.outputFiles[0].text;
}

async function openReferencePreview() {
  const runs = new Map();
  const env = {
    ...previewEnvironment,
    LACE_PREVIEW_GITHUB_REPOSITORY: "org/site",
    LACE_PREVIEW_GITHUB_WORKFLOW: "lace-preview.yml",
    LACE_PREVIEW_GITHUB_REF: "main",
    LACE_PREVIEW_GITHUB_TOKEN: "d".repeat(40),
    LACE_PREVIEW_SITE_PATH: "site",
  };
  const worker = await createWorkerFixture(createCloudflareWorker, cleanups, {
    config: await referenceConfig(),
    privatePreviewBucket: true,
    env,
    localWorker: {
      script: await bundleWorker(),
      bindings: { ...env, LACE_PUBLIC_BASE_URL: `${origin}/`, LACE_AUTH_SECRET: secret },
    },
    previewGitHubFetch: async (value, init) => {
      const url = new URL(String(value));
      expect(url.origin).toBe("https://api.github.com");
      if (url.pathname.endsWith("/commits/main")) return new Response(previewCommit);
      if (url.pathname.endsWith("/dispatches")) {
        const { inputs } = JSON.parse(init.body);
        const id = 100 + runs.size;
        runs.set(inputs.generation, id);
        return Response.json({ workflow_run_id: id });
      }
      const id = Number(url.pathname.split("/").at(-1));
      const generation = [...runs].find(([, run]) => run === id)?.[0];
      if (!generation) throw new Error("Unknown preview run");
      return Response.json({
        id,
        path: ".github/workflows/lace-preview.yml@main",
        display_title: `Lace preview ${generation}`,
        event: "workflow_dispatch",
        status: "in_progress",
        head_sha: previewCommit,
        run_attempt: 1,
      });
    },
  });
  await worker.signIn();
  return referencePreviewFixture(
    {
      call: (path, init) =>
        worker.call(path, {
          ...init,
          headers: { origin, ...Object.fromEntries(new Headers(init.headers)) },
        }),
      runnerOrigin: origin,
      fetchRunner: (request) =>
        request.method === "PUT"
          ? worker.local.dispatchFetch(request.url, {
              method: "PUT",
              headers: request.headers,
              body: request.body,
              duplex: "half",
            })
          : worker.worker.fetch(request, worker.env, worker.ctx),
      runId: (id) => String(runs.get(id)),
      dispatches: () => runs.size,
      runtime: worker.runtime,
      now: worker.now,
      publicOrigin: origin,
      fetchPublic: (request) => worker.worker.fetch(request, worker.env, worker.ctx),
      readCompleteBuildExport,
    },
    expect,
  );
}

test("local D1 admits only publication-ready preview references", async () => {
  await checkReferencePreviewAdmission(await openReferencePreview(), expect);
}, 30_000);

test("the Worker renders the published author and preserves the ready preview after republication", async () => {
  await checkReferencePreviewRender(await openReferencePreview(), gifFixture, expect);
}, 30_000);
