import { createServer } from "node:http";
import { createRequire } from "node:module";
import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { afterAll, beforeAll, expect, test } from "vitest";
import LaceImage from "./LaceImage.astro";

// Astro's own sharp generates the originals the local media server returns.
const sharp = createRequire(createRequire(import.meta.url).resolve("astro/package.json"))("sharp");

let server;
let origin;
const served = [];

beforeAll(async () => {
  const photo = await sharp({
    create: { background: "#3a6", channels: 3, height: 2000, width: 3000 },
  })
    .jpeg()
    .toBuffer();
  server = createServer((request, response) => {
    served.push(request.url);
    response.writeHead(200, { "content-type": "image/jpeg" });
    response.end(photo);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
});

afterAll(async () => {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
});

async function render(props) {
  const container = await AstroContainer.create();
  return container.renderToString(LaceImage, { props });
}

function photo(overrides = {}) {
  return {
    alt: "Studio desk",
    height: 2000,
    mimeType: "image/jpeg",
    sourceUrl: `${origin}/api/v1/public/media/photo`,
    src: "https://cms.example/api/v1/public/media/photo",
    width: 3000,
    ...overrides,
  };
}

function attribute(html, name) {
  return html.match(new RegExp(`\\s${name}="([^"]*)"`, "u"))?.[1];
}

test("a sourced image renders WebP variants, sizes and an inline placeholder", async () => {
  const html = await render({
    "data-lace-part": "media",
    image: photo({ objectPosition: "25% 40%" }),
    sizes: "(min-width: 64rem) 60rem, 100vw",
  });
  const srcset = attribute(html, "srcset");
  expect(srcset).toMatch(/^\S+ 960w, \S+ 1920w$/u);
  expect(srcset).toContain("f=webp");
  expect(attribute(html, "src")).toBe(srcset.split(" ")[0]);
  expect(html).toContain('sizes="(min-width: 64rem) 60rem, 100vw"');
  expect(html).toContain('width="3000"');
  expect(html).toContain('height="2000"');
  expect(html).toContain('loading="lazy"');
  expect(html).toContain('decoding="async"');
  expect(html).toContain('data-lace-part="media"');
  expect(html).not.toContain("fetchpriority");
  const style = attribute(html, "style");
  expect(style).toContain("object-position:25% 40%");
  expect(style).toContain("background-image:url(&quot;data:image/svg+xml,");
  expect(style).toContain("background-size:cover");
  expect(style).toContain("background-position:25% 40%");
  expect(html).not.toContain("<button");
  expect(html).not.toContain("<dialog");
  // A second render reuses the first fetch for its placeholder.
  const before = served.length;
  await render({ image: photo() });
  expect(served.length).toBe(before);
});

test("an image without a build source keeps its public URL", async () => {
  const html = await render({
    "data-lace-part": "media",
    image: photo({ objectPosition: "10% 20%", sourceUrl: undefined }),
  });
  expect(html).toBe(
    '<img alt="Studio desk" data-lace-part="media" decoding="async" height="2000" loading="lazy" src="https://cms.example/api/v1/public/media/photo" style="object-position:10% 20%" width="3000">',
  );
});

test("an eager image raises its fetch priority", async () => {
  const html = await render({ image: photo({ sourceUrl: undefined }), loading: "eager" });
  expect(html).toContain('fetchpriority="high"');
  expect(html).toContain('loading="eager"');
});

test("the lightbox opens the original in a script-free modal dialog", async () => {
  const html = await render({
    "data-lace-part": "media",
    image: photo({ sourceUrl: undefined }),
    lightbox: true,
    lightboxId: "lace-lightbox-e1-gallery-1-0",
  });
  expect(html).toBe(
    '<button aria-haspopup="dialog" aria-label="Open full-size image: Studio desk" command="show-modal" commandfor="lace-lightbox-e1-gallery-1-0" data-lace-part="lightbox-trigger" type="button">' +
      '<img alt="Studio desk" data-lace-part="media" decoding="async" height="2000" loading="lazy" src="https://cms.example/api/v1/public/media/photo" width="3000">' +
      "</button>" +
      '<dialog aria-label="Studio desk" closedby="any" data-lace-part="lightbox" id="lace-lightbox-e1-gallery-1-0">' +
      '<button command="close" commandfor="lace-lightbox-e1-gallery-1-0" data-lace-part="lightbox-close" type="button">Close</button>' +
      '<img alt="Studio desk" data-lace-part="lightbox-media" decoding="async" height="2000" loading="lazy" src="https://cms.example/api/v1/public/media/photo" width="3000">' +
      "</dialog>",
  );
  expect(html).not.toContain("<script");
});

test("a decorative image gets generic lightbox names", async () => {
  const html = await render({
    image: photo({ alt: "", sourceUrl: undefined }),
    lightbox: true,
    lightboxId: "box",
  });
  expect(html).toContain('aria-label="Open full-size image"');
  expect(html).toContain('aria-label="Full-size image"');
});

test("the lightbox requires an identifier", async () => {
  await expect(render({ image: photo({ sourceUrl: undefined }), lightbox: true })).rejects.toThrow(
    /lightboxId/u,
  );
});
