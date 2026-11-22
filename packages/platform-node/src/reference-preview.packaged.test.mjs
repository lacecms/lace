import { createHmac } from "node:crypto";
import { afterEach, expect, test, vi } from "vitest";
import { gifFixture, InMemoryObjectStorage, readCompleteBuildExport } from "@lacecms/test-utils";
import * as platform from "../dist/index.js";
import { openNodeTestRuntime } from "./test-support/node-runtime-harness.ts";
import {
  checkReferencePreviewAdmission,
  previewCommit,
  previewEnvironment,
  referenceConfig,
  referencePreviewFixture,
} from "../../../tests/fixtures/reference-preview.mjs";
import { checkReferencePreviewRender } from "../../../tests/fixtures/reference-preview-render.mjs";

const builderSecret = "c".repeat(40);
const runnerOrigin = "http://runner.lace.test";
const builderOrigin = "http://builder.lace.test";

function memoryPreviewBlobs() {
  const objects = new Map();
  return {
    async put({ key, body }) {
      if (objects.has(key)) return "exists";
      const chunks = [];
      if (body instanceof Uint8Array) chunks.push(body);
      else for await (const chunk of body) chunks.push(chunk);
      objects.set(key, Buffer.concat(chunks));
      return "created";
    },
    async get(key, range) {
      const content = objects.get(key);
      if (!content) return null;
      const bytes = range ? content.subarray(range.offset, range.offset + range.length) : content;
      return {
        bytes: bytes.length,
        body: (async function* () {
          yield bytes;
        })(),
      };
    },
    async head(key) {
      return objects.get(key)?.length ?? null;
    },
    async list(prefix, limit) {
      return {
        objects: [...objects]
          .filter(([key]) => key.startsWith(prefix))
          .slice(0, limit)
          .map(([key, value]) => ({ key, bytes: value.length })),
      };
    },
    async delete(keys) {
      for (const key of keys) objects.delete(key);
    },
  };
}

afterEach(() => vi.unstubAllGlobals());

async function openReferencePreview() {
  let dispatched = 0;
  vi.stubGlobal("fetch", async (url, init) => {
    expect(String(url)).toBe(`${builderOrigin}/preview`);
    if (init.method === "PUT") return Response.json({ status: "reserved", commit: previewCommit });
    if (init.method === "DELETE") return new Response(null, { status: 200 });
    expect(init.method).toBe("POST");
    dispatched++;
    return new Response(null, { status: 202 });
  });
  const harness = await openNodeTestRuntime(
    {
      ...platform,
      createNodeRuntime(input) {
        return platform.createNodeRuntime({ ...input, previewBlobs: memoryPreviewBlobs() });
      },
    },
    {
      config: await referenceConfig(),
      sync: true,
      storage: new InMemoryObjectStorage(),
      settings: {
        ...previewEnvironment,
        LACE_PREVIEW_RUNNER_ORIGIN: runnerOrigin,
        LACE_PREVIEW_BUILDER_URL: builderOrigin,
        LACE_PREVIEW_BUILDER_SECRET: builderSecret,
      },
    },
  );
  const call = async (path, { json, body, method = "GET", headers } = {}) => {
    const requestHeaders = new Headers(headers);
    requestHeaders.set("origin", "https://lace.test");
    if (json !== undefined) requestHeaders.set("content-type", "application/json");
    const payload = json === undefined ? body : JSON.stringify(json);
    const response = await harness.runtime.app.fetch(
      new Request(`https://lace.test${path}`, {
        headers: requestHeaders,
        method,
        ...(payload === undefined && method === "GET" ? {} : { body: payload }),
      }),
    );
    const data = response.status === 204 ? undefined : await response.json();
    return { response, body: data };
  };
  return referencePreviewFixture(
    {
      call,
      runnerOrigin,
      fetchRunner: (request) => harness.runtime.app.fetch(request),
      runId: (id) => createHmac("sha256", builderSecret).update(`preview/${id}`).digest("hex"),
      dispatches: () => dispatched,
      runtime: harness.runtime,
      now: Date.now,
      publicOrigin: "https://lace.test",
      fetchPublic: (request) => harness.runtime.app.fetch(request),
      readCompleteBuildExport,
    },
    expect,
  );
}

test("SQLite admits only publication-ready preview references", async () => {
  await checkReferencePreviewAdmission(await openReferencePreview(), expect);
}, 30_000);

test("Node renders the published author and preserves the ready preview after republication", async () => {
  await checkReferencePreviewRender(await openReferencePreview(), gifFixture, expect);
}, 30_000);
