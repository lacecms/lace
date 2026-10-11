import { execFile, execFileSync } from "node:child_process";
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
      LACE_SITE_DATA_MODE: "fixture",
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
        ["cta", "home-cta"],
      ],
    ],
    [
      post,
      [
        ["richText", "post-rich-text"],
        ["image", "post-image"],
        ["quote", "post-quote"],
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
      ...html.matchAll(
        /<(?:section|figure|blockquote|aside)\b[^>]*data-lace-block="([^"]+)"[^>]*data-lace-block-key="([^"]+)"/gu,
      ),
    ].map((match) => [match[1], match[2]]);
    expect(roots).toEqual(expected);
  }

  for (const [html, expected] of [
    [home, ["eyebrow", "heading", "body", "media", "action", "heading", "body", "action"]],
    [post, ["content", "media", "caption", "text", "attribution"]],
    [about, ["heading"]],
    [note, ["text", "attribution", "media"]],
  ]) {
    expect([...html.matchAll(/data-lace-part="([^"]+)"/gu)].map((match) => match[1])).toEqual(
      expected,
    );
  }

  expect(home).toMatch(
    /<main data-lace-model="home" data-lace-entry="home-entry"><section class="hero" data-lace-block="hero" data-lace-block-key="home-hero">.*?<h1 data-lace-part="heading">/su,
  );
  expect(post).toMatch(
    /<main data-lace-model="posts" data-lace-entry="first-post-entry">.*?<figure data-lace-block="image" data-lace-block-key="post-image">/su,
  );

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
  expect(post).toContain("First published post");
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

    // An export without a published settings global falls back to static values.
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
      /block note-image of model notes entry first-note-entry: media note-media is not among the entry's resolved media/u,
    );
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}, 60_000);
