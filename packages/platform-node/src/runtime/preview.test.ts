import { afterEach, expect, test, vi } from "vitest";
import { createHash } from "node:crypto";
import { HeadObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import {
  assertPreviewPackage,
  assertPreviewResourceGuards,
  claimPreviewFixture,
  openPreviewSession,
} from "@lacecms/test-utils";
import { assertPreviewHandoff, draftPreviewOrigin, seedReadyPreview } from "@lacecms/test-utils";
import { unixMilliseconds } from "@lacecms/domain";
import {
  localS3PreviewFixture,
  nodePreviewAdmin,
  nodePreviewFixture,
} from "../test-support/preview-fixture.js";
import { assertPreviewCleanup } from "@lacecms/test-utils";
import { NodePreviewBlobStorage } from "../media/preview-s3.js";

const cleanups: Array<() => unknown> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

const s3 = process.env.LACE_TEST_PREVIEW_S3_URL;
test.skipIf(!s3)(
  "S3 verifies and seals a private preview package, and Node streams only listed files",
  async () => {
    const { bucket } = await localS3PreviewFixture(cleanups, s3!);
    const { runtime, run, signIn } = await nodePreviewFixture(cleanups, { endpoint: s3!, bucket });
    const fetch = async (request: Request) => runtime.app.fetch(request);
    const claim = await claimPreviewFixture(runtime.repository.preview, run, Date.now());
    const { css, cssBody } = await assertPreviewPackage(runtime.previewPackages!, claim, true);
    const parentCookie = await signIn();
    const cookie = await openPreviewSession(fetch, parentCookie, claim.id);
    const response = await fetch(
      new Request(`${draftPreviewOrigin}/p/${claim.id}/${css.path}`, { headers: { cookie } }),
    );
    expect(response.status).toBe(200);
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(cssBody);
    for (const path of [
      "originals/other.png",
      "_astro%2fpage.css",
      ".env",
      "main.js.map",
      "draft//index.html",
    ]) {
      const denied = await fetch(
        new Request(`${draftPreviewOrigin}/p/${claim.id}/${path}`, { headers: { cookie } }),
      );
      expect(denied.status).toBe(404);
    }
    const normalized = new Request(`${draftPreviewOrigin}/p/${claim.id}/draft/%2e%2e/${css.path}`, {
      headers: { cookie },
    });
    runtime.setRequestPeer(normalized, undefined, `/p/${claim.id}/draft/%2e%2e/${css.path}`);
    expect((await fetch(normalized)).status).toBe(404);
    await assertPreviewResourceGuards({
      fetch,
      run,
      parentCookie,
      generationId: claim.id,
      logout: async () => {
        expect(
          (
            await fetch(
              new Request(`${nodePreviewAdmin}/api/auth/sign-out`, {
                method: "POST",
                headers: { cookie: parentCookie, origin: nodePreviewAdmin },
              }),
            )
          ).status,
        ).toBe(200);
      },
    });
  },
);

test.skipIf(!s3)(
  "Node maintenance retries private namespace deletion and bounds credentials and inputs",
  async () => {
    const { client, bucket } = await localS3PreviewFixture(cleanups, s3!);
    const { runtime, run, signIn } = await nodePreviewFixture(cleanups, { endpoint: s3!, bucket });
    const claim = await claimPreviewFixture(runtime.repository.preview, run, Date.now());
    let now = Date.now();
    const clock = vi.spyOn(Date, "now").mockImplementation(() => now);
    const deletes = vi.spyOn(NodePreviewBlobStorage.prototype, "delete");
    cleanups.push(() => {
      deletes.mockRestore();
      clock.mockRestore();
    });
    await assertPreviewCleanup({
      packages: runtime.previewPackages!,
      claim,
      parentCookie: await signIn(),
      run,
      fetch: async (request) => runtime.app.fetch(request),
      count: async (sql) =>
        (runtime.database.connection.prepare(sql).get() as { tally: number }).tally,
      put: (key) =>
        client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: "fixture" })),
      head: async (key) => {
        try {
          return await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
        } catch (error) {
          if (error instanceof Error && error.name === "NotFound") return null;
          throw error;
        }
      },
      sweep: async () => {
        await runtime.maintainOperations();
        now += 60_000;
      },
      failNextDeletion: () => {
        deletes.mockRejectedValueOnce(new Error("fixture storage offline"));
      },
    });
    expect(deletes).toHaveBeenCalledTimes(4);
  },
);

test("SQLite exchanges one-use preview handoffs against real Better Auth sessions", async () => {
  const { runtime, run, signIn } = await nodePreviewFixture(cleanups);
  const parentCookie = await signIn();
  for (const id of ["one", "two"]) await seedReadyPreview(run, id, Date.now());
  const now = unixMilliseconds(Date.now());
  const [user] = runtime.database.connection.prepare("select id from user").all() as {
    id: string;
  }[];
  const build = await runtime.security.createBuildToken({ name: "builder", now });
  const importer = await runtime.security.createImportToken({
    name: "importer",
    now,
    createdBy: user!.id,
    expiresAt: unixMilliseconds(now + 86_400_000),
    capabilities: ["content:import"],
  });
  await assertPreviewHandoff({
    adminOrigin: nodePreviewAdmin,
    fetch: async (request) => runtime.app.fetch(request),
    parentCookie,
    otherCredentials: [build.token, importer.token, "mcp-only-bearer"],
    expire: async (operation) => {
      const clock = vi.spyOn(Date, "now").mockReturnValue(Date.now() + 61_000);
      try {
        await operation();
      } finally {
        clock.mockRestore();
      }
    },
    logout: async () => {
      expect(
        (
          await runtime.app.fetch(
            new Request(`${nodePreviewAdmin}/api/auth/sign-out`, {
              method: "POST",
              headers: { cookie: parentCookie, origin: nodePreviewAdmin },
            }),
          )
        ).status,
      ).toBe(200);
    },
    session: (token, id) =>
      runtime.repository.preview.access.previewDelivery(
        createHash("sha256").update(token).digest("hex"),
        draftPreviewOrigin,
        id,
        unixMilliseconds(Date.now()),
      ),
  });
});

test("Node only advertises configured preview admission in explicit checkpoint composition", async () => {
  const runnerEnvironment = {
    LACE_PREVIEW_ORIGIN: draftPreviewOrigin,
    LACE_PREVIEW_RUNNER_ORIGIN: "http://preview-runner.lace.test/",
    LACE_PREVIEW_BUILDER_URL: "http://builder.lace.test/",
    LACE_PREVIEW_BUILDER_SECRET: "test-builder-only-credential-for-preview",
    LACE_PREVIEW_RUNNER_SECRET: "test-executor-only-credential-for-preview",
    LACE_BUILD_SITE_ID: "main-site",
    LACE_BUILD_SITE_LABEL: "Main site",
    LACE_BUILD_SITE_URL: "https://public.lace.test/",
  };
  for (const previewAdminEnabled of [false, true]) {
    const fixture = await nodePreviewFixture(cleanups, { previewAdminEnabled, runnerEnvironment });
    const cookie = await fixture.signIn();
    const response = await fixture.runtime.app.fetch(
      new Request(`${nodePreviewAdmin}/api/v1/admin/preview/config`, { headers: { cookie } }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(
      previewAdminEnabled
        ? { ready: true, origin: draftPreviewOrigin, viewMode: "new-tab" }
        : { ready: false, missing: ["preview-disabled"] },
    );
  }
});
