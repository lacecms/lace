/// <reference types="node" />
import { expect } from "vitest";
import { describePreviewBytes, parsePreviewManifest } from "@lacecms/application";
import type { PreviewClaim, PreviewCommandPort, PreviewPackages } from "@lacecms/application";
import { unixMilliseconds } from "@lacecms/domain";
import { seedReadyPreview } from "./preview.js";

export async function claimPreviewFixture(
  repository: Pick<PreviewCommandPort, "claimPreview">,
  run: (sql: string, values: readonly unknown[]) => Promise<unknown>,
  now: number,
  id = "package",
): Promise<Omit<PreviewClaim, "now">> {
  await seedReadyPreview(run, id, now);
  await run(
    `update preview_generations set state = 'dispatched', ready_at = null, expires_at = null,
    output_sha256 = null, output_bytes = null, input_sha256 = ?, input_bytes = 10 where id = ?`,
    ["c".repeat(64), id],
  );
  await run("insert into preview_execution_slot values (1,?)", [id]);
  const claim = {
    id,
    executor: "fixture",
    run: "fixture-run",
    commit: "a".repeat(40),
    credentialHash: (await describePreviewBytes(new TextEncoder().encode(id))).sha256,
  };
  await expect(
    repository.claimPreview({ ...claim, now: unixMilliseconds(now) }),
  ).resolves.toBeTruthy();
  return claim;
}

export async function assertPreviewPackage(
  packages: PreviewPackages,
  claim: Omit<PreviewClaim, "now">,
  streamedUpload = false,
) {
  const htmlBody = new TextEncoder().encode("<main>Private preview</main>");
  const cssBody = new TextEncoder().encode("main{color:purple}");
  const imageBody = new Uint8Array([10, 20, 30, 40, 50]);
  const html = {
    path: "draft/index.html",
    contentType: "text/html; charset=utf-8",
    ...(await describePreviewBytes(htmlBody)),
  };
  const css = {
    path: "_astro/page.css",
    contentType: "text/css; charset=utf-8",
    ...(await describePreviewBytes(cssBody)),
  };
  const image = {
    path: "originals/photo.png",
    contentType: "image/png",
    ...(await describePreviewBytes(imageBody)),
  };
  const manifest = { schemaVersion: 1, html: html.path, files: [html, css, image] };
  for (const path of [
    "../outside.css",
    "assets/%2fother.css",
    "assets/%2e%2e/main.css",
    "assets\\main.css",
    "node_modules/main.js",
    ".env",
    "secret.json",
    "index.html",
    "main.js.map",
    "lace.config.ts",
  ]) {
    await expect(
      packages.prepare(claim, { ...manifest, files: [html, { ...css, path }] }),
    ).resolves.toBeNull();
  }
  await expect(
    packages.prepare(claim, {
      ...manifest,
      files: [html, { ...css, bytes: 32 * 1024 * 1024 + 1 }],
    }),
  ).resolves.toBeNull();
  expect(
    parsePreviewManifest(manifest, {
      manifestBytes: 1000,
      files: 3,
      perFileBytes: 100,
      totalBytes: 31,
    }),
  ).toBeNull();
  const output = await packages.prepare(claim, manifest);
  expect(output).not.toBeNull();
  await expect(packages.prepare(claim, manifest)).resolves.toEqual(output);
  await expect(packages.prepare(claim, { ...manifest, files: [html] })).resolves.toBeNull();
  await expect(packages.complete(claim, output!, [])).resolves.toBe(false);
  await expect(packages.stage({ ...claim, id: "another" }, css.path, css, cssBody)).resolves.toBe(
    false,
  );
  await expect(packages.stage(claim, "../another/page.css", css, cssBody)).resolves.toBe(false);
  await expect(packages.stage(claim, css.path, image, imageBody)).resolves.toBe(false);
  await expect(packages.stage(claim, css.path, css, new Uint8Array(css.bytes))).rejects.toThrow();
  await expect(packages.stage(claim, html.path, html, htmlBody)).resolves.toBe(true);
  async function* stylesheet() {
    yield cssBody.subarray(0, 4);
    yield cssBody.subarray(4);
  }
  await expect(
    packages.stage(claim, css.path, css, streamedUpload ? stylesheet() : cssBody),
  ).resolves.toBe(true);
  await expect(packages.stage(claim, image.path, image, imageBody)).resolves.toBe(true);
  await expect(packages.complete(claim, { ...output!, sha256: "0".repeat(64) }, [])).resolves.toBe(
    false,
  );
  await expect(packages.complete(claim, output!, [])).resolves.toBe(true);
  await expect(packages.complete(claim, output!, [])).resolves.toBe(true);
  await expect(packages.stage(claim, css.path, css, cssBody)).resolves.toBe(false);
  return { css, cssBody, html, htmlBody, image, imageBody, output: output! };
}
