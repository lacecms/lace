import { expect, test } from "vitest";
import { transformPreviewHtml } from "./html.js";
import { previewUrls } from "./urls.js";

function render(html: string) {
  const originals = new Set(["_lace_preview_media/cover.png"]);
  const used = new Set<string>();
  const assets = new Set([
    "download.pdf",
    "poster.webp",
    "image.png",
    "notes/old/detail.png",
    "style.css",
  ]);
  const urls = previewUrls(
    "/p/gen/",
    "https://example.test/journal/",
    "/notes/old/",
    assets,
    originals,
    used,
  );
  return { html: transformPreviewHtml(html, urls), used };
}

test("uses the public base for site-page navigation and keeps fragments and external rel tokens", () => {
  const { html } = render(`
    <!-- <a href=/wrong> untouched -->
    <a HREF = '/about?from=a&amp;count=2#where' TARGET="_self" rel="nofollow opener ugc">About</a>
    <a href="/journal/about">Based</a><a href="../other">Other</a><a href="?page=2">Query</a><a href="../../../archive">Archive</a>
    <a href="&#x23;details">Fragment</a>
    <a href="//external.test/news" rel="sponsored">External</a>
    <a href="mailto:editor@example.test">Mail</a>
    <script>const source = "<a href=/unparsed>";</script>
  `);
  expect(html).toContain(
    'href="https://example.test/journal/about?from=a&amp;count=2#where" target="_blank" rel="nofollow ugc noopener noreferrer"',
  );
  expect(html).toContain('href="https://example.test/journal/about"');
  expect(html).toContain('href="https://example.test/journal/notes/other"');
  expect(html).toContain('href="https://example.test/journal/notes/old/?page=2"');
  expect(html).toContain('href="https://example.test/journal/archive"');
  expect(html).toContain('<a href="#details">Fragment</a>');
  expect(html).toContain(
    'href="//external.test/news" rel="sponsored noopener noreferrer" target="_blank"',
  );
  expect(html).toContain('<a href="mailto:editor@example.test">Mail</a>');
  expect(html).toContain('const source = "<a href=/unparsed>";');
  expect(html).toContain("<!-- <a href=/wrong> untouched -->");
});

test("classifies originals, local downloads and assets separately from page links", () => {
  const { html, used } = render(`
    <link rel="stylesheet" href="/style.css">
    <link rel="canonical" href="https://example.test/journal/notes/old">
    <a download href="/download.pdf">Download</a>
    <a href="/p/gen/_lace_preview_media/cover.png">Original</a>
    <a href="https://files.example.test/other.pdf" rel="nofollow">External file</a>
    <img src="/journal/image.png" srcset="data:image/png;base64,aGVsbG8= 1x, /image.png 2x">
    <img src="detail.png">
    <video poster="/poster.webp"></video>
    <svg><image href="/image.png"/></svg>
    <template><img src="/image.png"></template>
    <div style="background:url('/poster.webp')"></div>
  `);
  for (const fragment of [
    'rel="stylesheet" href="/p/gen/style.css"',
    'rel="canonical" href="https://example.test/journal/notes/old"',
    'download="" href="/p/gen/download.pdf"',
    'href="/p/gen/_lace_preview_media/cover.png">Original',
    'href="https://files.example.test/other.pdf" rel="nofollow">',
    'srcset="data:image/png;base64,aGVsbG8= 1x, /p/gen/image.png 2x"',
    'src="/p/gen/notes/old/detail.png"',
    'poster="/p/gen/poster.webp"',
    '<image href="/p/gen/image.png">',
    '<template><img src="/p/gen/image.png"></template>',
    "/p/gen/poster.webp",
  ])
    expect(html).toContain(fragment);
  expect(used).toEqual(new Set(["_lace_preview_media/cover.png"]));
  expect(html).not.toContain("target=");
});

test("rejects base elements, redirects, missing resources and another generation's resource URLs", () => {
  expect(() => render('<base href="https://example.test/">')).toThrow(
    "remove the HTML base element",
  );
  expect(() => render('<meta http-equiv="refresh" content="1; url=/about">')).toThrow(
    "must not redirect",
  );
  expect(() => render('<img src="/missing.png">')).toThrow("referenced local asset is missing");
  expect(() => render('<img src="/p/other/image.png">')).toThrow("outside this preview generation");
});
