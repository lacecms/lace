import { execFile, execFileSync, spawnSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { createServer } from "node:http";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { expect, test } from "vitest";

const exec = promisify(execFile);
const siteRoot = fileURLToPath(new URL("..", import.meta.url));
const fixture = JSON.parse(
  readFileSync(new URL("./fixtures/published-export.json", import.meta.url), "utf8"),
);

// The entry scope only: the layout renders the navigation global in the header.
function entryScope(html) {
  return html.slice(html.indexOf("<main"), html.indexOf("</main>"));
}

function outputFiles(directory = join(siteRoot, "dist")) {
  return readdirSync(directory, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name));
}

test("the fixture build emits published static routes without CMS access", () => {
  execFileSync("pnpm", ["run", "build"], {
    cwd: siteRoot,
    env: {
      ...process.env,
      LACE_API_BASE_URL: "https://unreachable.example/lace",
      LACE_BUILD_SITE_URL: "https://site.example",
      LACE_SITE_DATA_MODE: "fixture",
      LACE_SITE_INDEXING: "",
    },
    stdio: "pipe",
  });

  const home = readFileSync(new URL("../dist/index.html", import.meta.url), "utf8");
  const post = readFileSync(new URL("../dist/blog/first-post/index.html", import.meta.url), "utf8");
  const about = readFileSync(new URL("../dist/about/index.html", import.meta.url), "utf8");
  const note = readFileSync(
    new URL("../dist/notes/first-note/index.html", import.meta.url),
    "utf8",
  );

  for (const [html, modelKey, entryId] of [
    [home, "home", "home-entry"],
    [post, "posts", "first-post-entry"],
    [about, "about", "about-entry"],
    [note, "notes", "first-note-entry"],
  ]) {
    expect(html.match(/<main\b/gu)).toHaveLength(1);
    expect(html).toContain(`<main data-lace-model="${modelKey}" data-lace-entry="${entryId}">`);
  }

  for (const [html, expected] of [
    [
      home,
      [
        ["hero", "home-hero"],
        ["navigation", "home-navigation"],
        ["cta", "home-cta"],
      ],
    ],
    [
      post,
      [
        ["richText", "post-rich-text"],
        ["image", "post-image"],
        ["quote", "post-quote"],
        ["gallery", "post-gallery"],
      ],
    ],
    [about, [["hero", "about-hero"]]],
    [
      note,
      [
        ["quote", "note-quote"],
        ["image", "note-image"],
      ],
    ],
  ]) {
    const roots = [
      ...entryScope(html).matchAll(
        /<(?:section|figure|blockquote|aside|nav)\b[^>]*data-lace-block="([^"]+)"[^>]*data-lace-block-key="([^"]+)"/gu,
      ),
    ].map((match) => [match[1], match[2]]);
    expect(roots).toEqual(expected);
  }

  for (const [html, expected] of [
    [
      home,
      // Hero, local navigation, call to action.
      [
        "eyebrow",
        "heading",
        "body",
        "media",
        "action",
        "list",
        "item",
        "link",
        "heading",
        "body",
        "action",
      ],
    ],
    [
      post,
      // Rich text, image, quote, gallery with two items.
      [
        "content",
        "media",
        "caption",
        "text",
        "attribution",
        "title",
        "items",
        "item",
        "media",
        "caption",
        "item",
        "media",
        "caption",
      ],
    ],
    [about, ["heading"]],
    [note, ["text", "attribution", "media"]],
  ]) {
    expect(
      [...entryScope(html).matchAll(/data-lace-part="([^"]+)"/gu)].map((match) => match[1]),
    ).toEqual(expected);
  }
  // Every built-in block renders inside some entry scope.
  expect(
    new Set(
      [home, post, about, note].flatMap((html) =>
        [...entryScope(html).matchAll(/data-lace-block="([^"]+)"/gu)].map((match) => match[1]),
      ),
    ),
  ).toEqual(new Set(["cta", "gallery", "hero", "image", "navigation", "quote", "richText"]));

  // The published navigation global renders in every header, with the current
  // route marked; the static fallback is not emitted.
  for (const [html, current] of [
    [home, '<a aria-current="page" data-lace-part="link" href="/">Home</a>'],
    [about, '<a aria-current="page" data-lace-part="link" href="/about">About</a>'],
    [post, '<a aria-current="page" data-lace-part="link" href="/blog/first-post">First post</a>'],
    [note, '<a aria-current="page" data-lace-part="link" href="/notes/first-note">First note</a>'],
  ]) {
    const header = html.slice(html.indexOf("<header"), html.indexOf("</header>"));
    expect(header).toContain(
      '<nav aria-label="Main" class="navigation" data-lace-block="navigation" data-lace-block-key="site-navigation">',
    );
    expect(header).toContain(
      '<li data-lace-part="item"><details data-lace-part="submenu"><summary data-lace-part="toggle">Writing</summary><ul data-lace-part="children">',
    );
    expect(header).toContain(current);
    expect(header.match(/aria-current=/gu)).toHaveLength(1);
    expect(html).not.toContain('class="site-nav"');
  }

  // Local navigation in page content links to an anchored block on the same page.
  expect(entryScope(home)).toContain(
    '<nav aria-label="On this page" class="navigation" data-lace-block="navigation" data-lace-block-key="home-navigation"><ul data-lace-part="list"><li data-lace-part="item"><a data-lace-part="link" href="#get-started">Get started</a></li></ul></nav>',
  );

  // Gallery items use their own alt text and caption, then the media's.
  expect(post).toContain(
    '<section class="gallery" data-lace-block="gallery" data-lace-block-key="post-gallery"><h2 data-lace-part="title">From the studio</h2><ul data-lace-part="items" role="list">' +
      '<li data-lace-part="item"><figure><img alt="Media library description" data-lace-part="media" height="600" loading="lazy" src="https://cms.example.test/lace/api/v1/public/media/post-media" width="800"><figcaption data-lace-part="caption">Media library caption</figcaption></figure></li>' +
      '<li data-lace-part="item"><figure><img alt="A quiet desk" data-lace-part="media" height="480" loading="lazy" src="https://cms.example.test/lace/api/v1/public/media/note-media" width="640"><figcaption data-lace-part="caption">The note desk</figcaption></figure></li>' +
      "</ul></section>",
  );

  expect(home).toMatch(
    /<main data-lace-model="home" data-lace-entry="home-entry"><section class="hero" data-lace-block="hero" data-lace-block-key="home-hero">.*?<h1 data-lace-part="heading">/su,
  );
  expect(post).toMatch(
    /<main data-lace-model="posts" data-lace-entry="first-post-entry">.*?<figure class="full-bleed" data-lace-block="image" data-lace-block-key="post-image">/su,
  );

  // Block anchors become root ids, editor classes follow the component's own
  // classes, and an in-page link reaches the anchored block.
  expect(home).toContain('<a href="#get-started">See how to start</a>');
  expect(home.match(/\bid="get-started"/gu)).toHaveLength(1);
  expect(home.match(/href="#get-started"/gu)).toHaveLength(2);
  expect(home).toContain(
    '<aside class="cta cta--highlight" data-lace-block="cta" data-lace-block-key="home-cta" id="get-started">',
  );
  expect(post).not.toMatch(/<figure\b[^>]*\bid=/u);
  for (const html of [about, note]) {
    expect(html).not.toMatch(
      /<(?:section|figure|blockquote|aside)\b[^>]*data-lace-block=[^>]*\bid=/u,
    );
  }
  expect(about).toContain(
    '<section class="hero" data-lace-block="hero" data-lace-block-key="about-hero">',
  );
  expect(note).toContain('<blockquote data-lace-block="quote" data-lace-block-key="note-quote">');

  expect(home).toContain("The static Lace starter");
  expect(home).toContain("[data-lace-block=hero]");
  expect(home).toContain("padding-block:2rem");
  expect(about).toContain("[data-lace-block=hero]");
  // Without LACE_PUBLIC_BASE_URL the site keeps the media URLs of the export.
  expect(home).toContain(
    '<img alt="Lace starter illustration" data-lace-part="media" height="630" src="https://cms.example.test/lace/api/v1/public/media/hero-media" style="object-position:30% 20%" width="1200">',
  );
  expect(post).toContain(
    '<img alt="A durable media URL" data-lace-part="media" height="600" src="https://cms.example.test/lace/api/v1/public/media/post-media" width="800">',
  );
  expect(post).toContain('<figcaption data-lace-part="caption">Media is served by Lace.');
  // The stored SEO title replaces the entry title in the head.
  expect(post).not.toContain("First published post");
  expect(post).toContain("Content belongs in the CMS");
  expect(about).toContain("Built with Lace");
  expect(note).toContain("Notes render from the published export.");
  // Without block or media alt text the image keeps an empty alt attribute, which
  // the minified output writes as a bare `alt`.
  expect(note).toMatch(
    /<img alt(?:="")? data-lace-part="media" height="480" src="[^"]*\/note-media" width="640">/u,
  );
  // Every route renders the site header from the published settings global.
  for (const html of [home, post, about, note]) {
    expect(html).toMatch(
      /<header class="site-header"><a class="site-name" href="\/">Lace Journal<\/a>/u,
    );
    expect(html).toContain('<p class="site-tagline">Notes from the reference site</p>');
  }
  expect(`${home}${post}${about}${note}`).not.toContain("DRAFT ONLY");
  expect(`${home}${post}${about}${note}`).not.toContain("javascript:");

  // Head metadata resolves stored values, mapped fields and the settings defaults.
  const heroImage =
    '<meta content="https://cms.example.test/lace/api/v1/public/media/hero-media" property="og:image"><meta content="1200" property="og:image:width"><meta content="630" property="og:image:height"><meta content="Lace starter illustration" property="og:image:alt"><meta content="summary_large_image" name="twitter:card">';
  expect(home).toContain(
    '<title>Lace starter · Lace Journal</title><meta content="The reference site of the Lace CMS." name="description"><link href="https://site.example/" rel="canonical"><meta content="Lace starter · Lace Journal" property="og:title"><meta content="The reference site of the Lace CMS." property="og:description"><meta content="website" property="og:type"><meta content="https://site.example/" property="og:url"><meta content="Lace Journal" property="og:site_name">' +
      heroImage,
  );
  expect(post).toContain(
    '<title>Release notes &amp; &lt;updates&gt;</title><meta content="How the reference site renders published posts." name="description"><link href="https://site.example/blog/first-post" rel="canonical">',
  );
  expect(post).toContain('<meta content="article" property="og:type">');
  expect(post).toContain(
    '<meta content="https://cms.example.test/lace/api/v1/public/media/post-media" property="og:image"><meta content="800" property="og:image:width"><meta content="600" property="og:image:height"><meta content="Media library description" property="og:image:alt">',
  );
  // Inside a quoted attribute `<` is plain text; the title element escapes it.
  expect(post).toContain('<meta content="Release notes &amp; <updates>" property="og:title">');
  expect(post.split("<updates>")).toHaveLength(2);
  expect(about).toContain('<link href="https://lace.example.org/about" rel="canonical">');
  expect(about).toContain('<meta content="https://lace.example.org/about" property="og:url">');
  expect(about).toContain(heroImage);
  expect(note).toContain(
    '<title>First published note · Lace Journal</title><meta content="A short published note" name="description"><link href="https://site.example/notes/first-note" rel="canonical"><meta content="noindex, follow" name="robots">',
  );
  for (const html of [home, post, about]) expect(html).not.toContain('name="robots"');
  expect(readFileSync(join(siteRoot, "dist/sitemap.xml"), "utf8")).toBe(
    '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
      "  <url>\n    <loc>https://site.example/</loc>\n    <lastmod>2026-09-20T00:00:00.000Z</lastmod>\n  </url>\n" +
      "  <url>\n    <loc>https://site.example/blog/first-post</loc>\n    <lastmod>2026-09-20T00:00:00.000Z</lastmod>\n  </url>\n" +
      "</urlset>\n",
  );
  expect(readFileSync(join(siteRoot, "dist/robots.txt"), "utf8")).toBe(
    "User-agent: *\nAllow: /\n\nSitemap: https://site.example/sitemap.xml\n",
  );
}, 30_000);

test("a fixture build without a site URL and with indexing off writes no sitemap", () => {
  const result = spawnSync("pnpm", ["run", "build"], {
    cwd: siteRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      LACE_API_BASE_URL: "https://unreachable.example/lace",
      LACE_BUILD_SITE_URL: "",
      LACE_SITE_DATA_MODE: "fixture",
      LACE_SITE_INDEXING: "off",
    },
  });
  expect(result.status).toBe(0);
  expect(`${result.stdout}${result.stderr}`).toContain(
    "LACE_BUILD_SITE_URL is not set: sitemap.xml is not generated",
  );
  const files = outputFiles().map((file) => file.slice(join(siteRoot, "dist").length + 1));
  expect(files).not.toContain("sitemap.xml");
  expect(readFileSync(join(siteRoot, "dist/robots.txt"), "utf8")).toBe(
    "User-agent: *\nDisallow: /\n",
  );
  for (const path of [
    "index.html",
    "blog/first-post/index.html",
    "about/index.html",
    "notes/first-note/index.html",
  ]) {
    const html = readFileSync(join(siteRoot, "dist", path), "utf8");
    expect(html).toContain('<meta content="noindex, nofollow" name="robots">');
    if (path === "about/index.html") {
      expect(html).toContain('<link href="https://lace.example.org/about" rel="canonical">');
    } else {
      expect(html).not.toContain('rel="canonical"');
      expect(html).not.toContain('property="og:url"');
    }
  }
}, 30_000);

test("a live build reads one export, keeps the token out of output and rejects unrenderable blocks", async () => {
  const token = "lace_build_reference-site-sentinel";
  let served = structuredClone(fixture);
  let calls = 0;
  const server = createServer((request, response) => {
    calls++;
    if (
      request.url !== "/lace/api/v1/public/build-export" ||
      request.headers.authorization !== `Bearer ${token}`
    ) {
      response.writeHead(403).end();
      return;
    }
    response.writeHead(200, { "content-type": "application/json", etag: '"7"' });
    response.end(JSON.stringify(served));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const build = () =>
    exec("pnpm", ["run", "build"], {
      cwd: siteRoot,
      env: {
        ...process.env,
        LACE_API_BASE_URL: `http://127.0.0.1:${server.address().port}/lace`,
        LACE_BUILD_TOKEN: token,
        LACE_PUBLIC_BASE_URL: "https://public.example/lace",
        LACE_SITE_DATA_MODE: "live",
      },
    });
  try {
    await build();
    expect(calls).toBe(1);
    const home = readFileSync(join(siteRoot, "dist/index.html"), "utf8");
    expect(home).toContain('src="https://public.example/lace/api/v1/public/media/hero-media"');
    for (const file of outputFiles()) expect(readFileSync(file, "utf8")).not.toContain(token);
    expect(home).toContain(">Lace Journal</a>");

    // An export without published globals falls back to static values.
    served = structuredClone(fixture);
    delete served.globals;
    calls = 0;
    await build();
    expect(calls).toBe(1);
    for (const path of [
      "index.html",
      "blog/first-post/index.html",
      "notes/first-note/index.html",
    ]) {
      const html = readFileSync(join(siteRoot, "dist", path), "utf8");
      expect(html).toContain('<a class="site-name" href="/">Lace reference site</a>');
      expect(html).not.toContain(`<p class="site-tagline">`);
      expect(html).not.toContain("Lace Journal");
      const header = html.slice(html.indexOf("<header"), html.indexOf("</header>"));
      expect(header).toContain(
        '<nav aria-label="Main" class="site-nav"><ul><li><a href="/">Home</a></li><li><a href="/about">About</a></li></ul></nav>',
      );
      expect(header).not.toContain("data-lace-block");
    }

    served = structuredClone(fixture);
    served.entries[3].blocks[0].type = "unknownBlock";
    await expect(build()).rejects.toThrow(
      /block note-quote of model notes entry first-note-entry: the site has no component for block type unknownBlock/u,
    );

    served = structuredClone(fixture);
    served.entries[1].blocks[0].data.content.content[1].content[0].marks[0].attrs.href =
      "https:example.com";
    await expect(build()).rejects.toThrow(
      /block post-rich-text of model posts .* at field content/u,
    );

    served = structuredClone(fixture);
    delete served.media["note-media"];
    await expect(build()).rejects.toThrow(
      /block (?:note-image of model notes entry first-note-entry|post-gallery of model posts entry first-post-entry): media note-media is not among the entry's resolved media/u,
    );
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}, 60_000);
