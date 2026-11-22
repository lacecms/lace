import { buildReferenceSite } from "./reference-site.mjs";
import { selectionBlock } from "./reference-preview.mjs";

export async function checkReferencePreviewRender(fixture, gifFixture, expect) {
  const { home, create, save, publish, preview, status, claim, finish, request } = fixture;
  async function upload(name, width) {
    const form = new FormData();
    const bytes = gifFixture({ width, height: 2, frames: [{ width, height: 2 }] });
    form.append("file", new Blob([bytes], { type: "image/gif" }), `${name}.gif`);
    const asset = await request("/api/v1/admin/media", { method: "POST", body: form }, 201);
    return { id: asset.id, bytes: Buffer.from(bytes) };
  }

  const first = await upload("published-author", 4);
  const second = await upload("draft-author", 5);
  const author = await create("authors", "Author", { fields: { photo: first.id } });
  await publish(author, author.draft.revision);
  const authorDraft = await save(author, author.draft.revision, { fields: { photo: second.id } });

  const page = await home();
  const article = await save(page, page.draft.revision, {
    title: "Published article",
    blocks: [selectionBlock({ author: author.id })],
  });
  await publish(article, article.draft.revision);
  const draft = await save(article, article.draft.revision, {
    title: "Saved article",
    blocks: [selectionBlock({ author: author.id })],
  });

  const { token } = await request(
    "/api/v1/admin/api-tokens",
    { method: "POST", json: { name: "REL1D export" } },
    201,
  );
  const firstPublic = await fixture.readExport(token);
  expect(firstPublic.records.find(({ id }) => id === author.id)?.fields.photo).toBe(first.id);
  expect(firstPublic.media).not.toHaveProperty(second.id);
  const publicRoute = () => request("/api/v1/public/content/by-path?path=%2F");
  const publicArticle = await publicRoute();
  expect(publicArticle.entry.title).toBe("Published article");
  expect((await fixture.publicFetch(`/api/v1/public/media/${second.id}`)).status).toBe(404);
  const before = await buildReferenceSite(firstPublic);
  expect(before.html).toContain(`/api/v1/public/media/${first.id}`);
  expect(before.html).not.toContain(second.id);
  expect(before.html).toContain("<h1>Published article</h1>");

  const generation = await preview(article, draft.draft.revision, "frozen-author");
  const run = await claim(generation.id);
  const input = await run("input");
  expect(input.status).toBe(200);
  const captured = await input.json();
  expect(captured.target.title).toBe("Saved article");
  expect(captured.context.records.find(({ id }) => id === author.id)?.fields.photo).toBe(first.id);
  expect(captured.context.media).not.toHaveProperty(second.id);
  expect((await run(`input?mediaId=${second.id}`)).status).toBe(404);
  const ready = await buildReferenceSite(firstPublic, {
    input: async () => captured,
    original: (id) => run(`input?mediaId=${id}`),
  });
  expect(ready.html).toContain("<h1>Saved article</h1>");
  expect(ready.html).toContain(`/p/${generation.id}/_lace_preview_media/${first.id}.gif`);
  expect(ready.html).not.toContain(second.id);
  expect(ready.mediaIds).toEqual([first.id]);
  expect(ready.files.find(({ path }) => path.endsWith("/" + first.id + ".gif"))?.body).toEqual(
    first.bytes,
  );
  await finish(run, ready.files, ready.mediaIds);
  expect(await status(article)).toMatchObject({ id: generation.id, state: "ready" });

  await publish(authorDraft, authorDraft.draft.revision);
  const nextPublic = await fixture.readExport(token);
  expect(nextPublic.version).toBe(firstPublic.version + 1);
  expect(nextPublic.records.find(({ id }) => id === author.id)?.fields.photo).toBe(second.id);
  const after = await buildReferenceSite(nextPublic);
  expect(after.html).toContain(`/api/v1/public/media/${second.id}`);
  expect(after.html).not.toContain(first.id);
  expect(after.html).toContain("<h1>Published article</h1>");
  expect(await publicRoute()).toEqual(publicArticle);
  expect((await fixture.publicFetch(`/api/v1/public/media/${second.id}`)).status).toBe(200);
  expect(await status(article)).toMatchObject({ id: generation.id, state: "ready" });
  expect(await fixture.readReady(generation.id)).toBe(ready.html);
}
