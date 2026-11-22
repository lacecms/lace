import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { json, login, readExport } from "../cloudflare-consumer-acceptance.mjs";
import { digest } from "./rc5-state.mjs";

export function siteProbe(base, secretValues, png) {
  const password = randomBytes(24).toString("hex");
  const email = "rc5-owner@lace.test";
  const origin = new URL(base).origin;
  const publishedTitle = "RC5 published gallery";
  const draftTitle = "RC5 unpublished changes";
  let cookie, token, entryId, original;
  secretValues.add(password);
  const call = (path, options) =>
    json(base, "api/v1/" + path, { ...options, headers: { cookie, origin } });
  async function upload(name, bytes) {
    const form = new FormData();
    form.append("file", new Blob([bytes], { type: "image/png" }), name + ".png");
    const media = await call("admin/media", { method: "POST", body: form });
    assert.ok(media.id);
    return { id: media.id, sha256: digest(bytes) };
  }
  async function mediaRead(media) {
    const response = await fetch(new URL("api/v1/admin/media/" + media.id + "/preview", base), {
      headers: { cookie },
      signal: AbortSignal.timeout(15000),
    });
    assert.equal(response.status, 200);
    assert.equal(digest(Buffer.from(await response.arrayBuffer())), media.sha256);
  }
  async function seed(bootstrap) {
    await json(base, "api/v1/setup/admin", {
      method: "POST",
      headers: { origin },
      json: { email, password, token: bootstrap },
    });
    cookie = await login(base, email, password, secretValues);
    original = await upload("original", png);
    await mediaRead(original);
    const home = (await call("admin/models/home/entries")).items[0];
    await call("admin/entries/" + home.id + "/publish", {
      method: "POST",
      json: { expectedRevision: 1 },
    });
    const fields = { summary: "RC5 summary", relatedUrl: "entry:" + home.id };
    const created = await call("admin/models/posts/entries", {
      method: "POST",
      json: {
        title: publishedTitle,
        slug: "rc5-cutover",
        fields,
        blocks: [
          {
            key: "01J00000000000000000000099",
            type: "gallery",
            position: 1024,
            schemaVersion: 6,
            settings: { lightbox: true },
            data: { images: [{ media: original.id, alt: "RC5 image" }] },
          },
        ],
      },
    });
    entryId = created.id;
    await call("admin/entries/" + entryId + "/publish", {
      method: "POST",
      json: { expectedRevision: created.draft.revision },
    });
    const draft = (await call("admin/entries/" + entryId)).draft;
    await call("admin/entries/" + entryId + "/draft", {
      method: "PUT",
      json: {
        expectedRevision: draft.revision,
        fields,
        slug: draft.slug,
        blocks: draft.blocks,
        title: draftTitle,
      },
    });
    token = (await call("admin/api-tokens", { method: "POST", json: { name: "rc5-rebuild" } }))
      .token;
    assert.ok(token);
    secretValues.add(token);
  }
  async function verify(version) {
    cookie = await login(base, email, password, secretValues);
    assert.equal((await call("admin/settings/status")).engineVersion, version);
    assert.equal((await call("admin/entries/" + entryId)).draft.title, draftTitle);
    const exported = await readExport(base, token);
    const entry = exported.entries.find((item) => item.id === entryId);
    assert.equal(entry?.title, publishedTitle);
    await mediaRead(original);
  }
  async function rebuild(project, run, stage) {
    await run(stage, "pnpm", ["build"], {
      cwd: project,
      env: {
        LACE_BUILD_TOKEN: token,
        LACE_API_BASE_URL: base,
        LACE_PUBLIC_BASE_URL: base,
        ASTRO_TELEMETRY_DISABLED: "1",
      },
    });
    return served(project);
  }
  // Serve the generated route from the saved static output, independent of the CMS.
  async function served(project) {
    const file = join(project, "site/dist/blog/rc5-cutover/index.html");
    const server = createServer(async (req, res) => {
      if (req.url !== "/blog/rc5-cutover/") {
        res.writeHead(404).end();
        return;
      }
      try {
        res.end(await readFile(file));
      } catch {
        res.writeHead(404).end();
      }
    });
    await new Promise((accept, reject) =>
      server.once("error", reject).listen(0, "127.0.0.1", accept),
    );
    try {
      const response = await fetch(
        "http://127.0.0.1:" + server.address().port + "/blog/rc5-cutover/",
      );
      assert.equal(response.status, 200);
      const html = await response.text();
      assert.ok(
        html.includes(publishedTitle) &&
          !html.includes(draftTitle) &&
          html.includes('data-lace-block="gallery"'),
      );
      return digest(html);
    } finally {
      await new Promise((done) => server.close(done));
    }
  }
  return {
    seed,
    verify,
    rebuild,
    served,
    upload,
    mediaRead,
    originalMediaSha256: () => original.sha256,
    async verifyMissing(id) {
      const response = await fetch(new URL("api/v1/admin/media/" + id + "/preview", base), {
        headers: { cookie },
        signal: AbortSignal.timeout(15000),
      });
      assert.equal(response.status, 404);
    },
  };
}
