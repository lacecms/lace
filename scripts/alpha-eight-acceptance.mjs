import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";

/** Consumer-owned configuration, applied before the generated runtime synchronizes. */
export async function configureAlphaEight(project) {
  const path = join(project, "lace.config.ts");
  const text = await readFile(path, "utf8");
  const anchor =
    'fields: { summary: field.text(), relatedUrl: field.url({ label: "Related page" }) },';
  assert.ok(text.includes(anchor), "alpha.8 collection fixture anchor changed");
  const configured = text.replace(
    anchor,
    `${anchor}\n      listOptions: { sortableFields: ["summary"], filterableFields: ["summary"], searchableFields: ["summary"] },`,
  );
  await writeFile(path, configured);
  return { before: text, after: configured };
}

/** HTTP and SDK probes against saved Node images or the installed consumer Worker. */
export async function alphaEightJourney({
  base,
  project,
  email,
  password,
  buildToken,
  enable,
  secretValues,
  run,
  fetch: requestFetch = globalThis.fetch,
}) {
  const origin = new URL(base).origin;
  let cookie;
  const invoke = async (path, { json, form, headers, ...options } = {}) => {
    const response = await requestFetch(new URL(path, base), {
      ...options,
      redirect: "manual",
      signal: AbortSignal.timeout(30_000),
      headers: {
        origin,
        ...(cookie ? { cookie } : {}),
        ...(json ? { "content-type": "application/json" } : {}),
        ...(form ? { "content-type": "application/x-www-form-urlencoded" } : {}),
        ...headers,
      },
      ...(json ? { body: JSON.stringify(json) } : {}),
      ...(form ? { body: form.toString() } : {}),
    });
    const text = await response.text();
    let body;
    try {
      body = text ? JSON.parse(text) : undefined;
    } catch {
      /* Non-JSON denial is permitted. */
    }
    return { response, body };
  };
  const ok = async (path, options) => {
    const result = await invoke(path, options);
    assert.ok(result.response.ok, `alpha.8 ${path}: HTTP ${result.response.status}`);
    return result;
  };
  // The initial generated deployment must remain off until the operator opts in.
  assert.equal((await invoke(".well-known/oauth-protected-resource/mcp")).response.status, 404);
  await enable();
  const login = await ok("api/auth/sign-in/email", { method: "POST", json: { email, password } });
  cookie = login.response.headers
    .getSetCookie()
    .map((value) => value.split(";")[0])
    .join("; ");
  assert.ok(cookie);
  secretValues.add(cookie);
  const metadata = await ok(".well-known/oauth-protected-resource/mcp");
  assert.equal(metadata.body.resource, new URL("mcp", base).href);
  await ok(".well-known/oauth-authorization-server/api/auth");
  const published = async () =>
    (
      await ok("api/v1/public/build-export", {
        headers: { authorization: `Bearer ${buildToken}`, cookie: "" },
      })
    ).body;
  const before = await published();
  assert.equal(before.formatVersion, 2);
  const clients = [];
  try {
    const authorize = async (write) => {
      const registered = await ok("api/auth/oauth2/register", {
        method: "POST",
        json: {
          client_name: `Alpha eight ${write ? "writer" : "reader"}`,
          redirect_uris: [`${origin}/alpha-eight/callback`],
          scope: "content:read content:write offline_access",
          application_type: "native",
        },
      });
      const verifier = randomBytes(32).toString("base64url");
      secretValues.add(verifier);
      const query = new URLSearchParams({
        client_id: registered.body.client_id,
        response_type: "code",
        redirect_uri: `${origin}/alpha-eight/callback`,
        resource: `${origin}/mcp`,
        scope: "content:read content:write offline_access",
        state: "alpha-eight",
        code_challenge: createHash("sha256").update(verifier).digest("base64url"),
        code_challenge_method: "S256",
      });
      const started = await ok(`api/auth/oauth2/authorize?${query}`, {
        headers: { accept: "application/json" },
      });
      const consent = await ok("api/auth/oauth2/consent", {
        method: "POST",
        headers: { accept: "application/json" },
        json: {
          transaction: new URL(started.body.url).searchParams.get("mcpTransaction"),
          accept: true,
          scope: `content:read ${write ? "content:write " : ""}offline_access`,
        },
      });
      const code = new URL(consent.body.url).searchParams.get("code");
      secretValues.add(code);
      const tokens = await ok("api/auth/oauth2/token", {
        method: "POST",
        form: new URLSearchParams({
          grant_type: "authorization_code",
          client_id: registered.body.client_id,
          redirect_uri: `${origin}/alpha-eight/callback`,
          code,
          code_verifier: verifier,
          resource: `${origin}/mcp`,
        }),
      });
      for (const value of [tokens.body.access_token, tokens.body.refresh_token])
        if (value) secretValues.add(value);
      const client = new Client({ name: "alpha-eight-consumer", version: "0.0.0" });
      await client.connect(
        new StreamableHTTPClientTransport(new URL("mcp", base), {
          fetch: async (url, init) => {
            const headers = new Headers(init?.headers);
            headers.set("authorization", `Bearer ${tokens.body.access_token}`);
            let body = init?.body;
            if (typeof body === "string") {
              const message = JSON.parse(body);
              if (message.method === "initialize") {
                message.params.protocolVersion = "2025-11-25";
                body = JSON.stringify(message);
              }
            }
            return requestFetch(url, { ...init, headers, body });
          },
        }),
      );
      clients.push(client);
      return { client, token: tokens.body.access_token };
    };
    const reader = await authorize(false);
    assert.deepEqual((await reader.client.listTools()).tools.map((x) => x.name).sort(), [
      "get_entry",
      "list_content_models",
      "list_entries",
    ]);
    await assert.rejects(
      reader.client.callTool({
        name: "create_entry",
        arguments: { modelKey: "posts", title: "Denied", fields: {}, blocks: [] },
      }),
    );
    const writer = await authorize(true);
    assert.deepEqual((await writer.client.listTools()).tools.map((x) => x.name).sort(), [
      "create_entry",
      "get_entry",
      "list_content_models",
      "list_entries",
      "save_draft",
    ]);
    const result = (value) => {
      assert.ok(!value.isError, "alpha.8 tool returned an error");
      return value.structuredContent;
    };
    result(await writer.client.callTool({ name: "list_content_models", arguments: {} }));
    const draft = {
      modelKey: "posts",
      title: "Alpha eight assistant draft",
      slug: "alpha-eight-assistant",
      fields: {
        summary: "alpha-eight-query-value",
        relatedUrl: `entry:${encodeURIComponent(before.entries[0].id)}`,
      },
      blocks: [
        {
          key: `01J${"801".padStart(23, "0")}`,
          type: "gallery",
          schemaVersion: 4,
          position: 1024,
          data: { images: [] },
          settings: { layoutMode: "flex-row" },
        },
        {
          key: `01J${"802".padStart(23, "0")}`,
          type: "videoEmbed",
          schemaVersion: 1,
          position: 2048,
          data: { url: "https://youtu.be/dQw4w9WgXcQ", title: "Alpha eight video" },
        },
      ],
    };
    const created = result(
      await writer.client.callTool({ name: "create_entry", arguments: draft }),
    );
    const saved = result(
      await writer.client.callTool({
        name: "save_draft",
        arguments: {
          entryId: created.id,
          expectedRevision: created.draft.revision,
          title: "Alpha eight updated draft",
          slug: draft.slug,
          fields: draft.fields,
          blocks: draft.blocks,
        },
      }),
    );
    assert.equal(saved.draft.revision, created.draft.revision + 1);
    assert.equal(saved.published, undefined);
    const loaded = result(
      await writer.client.callTool({ name: "get_entry", arguments: { entryId: created.id } }),
    );
    assert.deepEqual(loaded, saved);
    assert.equal(
      loaded.draft.blocks.find((block) => block.type === "gallery").settings.layoutMode,
      "flex-row",
    );
    assert.equal(
      loaded.draft.blocks.find((block) => block.type === "videoEmbed").data.title,
      "Alpha eight video",
    );
    const queried = result(
      await writer.client.callTool({
        name: "list_entries",
        arguments: {
          modelKey: "posts",
          q: "alpha-eight-query-value",
          sort: "field:summary",
          filters: [{ field: "summary", op: "contains", value: "query-value" }],
        },
      }),
    );
    assert.ok(queried.items.some((item) => item.id === created.id));
    for (const name of ["publish_entry", "unpublish_entry", "delete_entry"])
      await assert.rejects(writer.client.callTool({ name, arguments: { entryId: created.id } }));
    for (const path of [
      `api/v1/admin/entries/${created.id}/publish`,
      `api/v1/admin/entries/${created.id}`,
    ]) {
      const denied = await invoke(path, {
        method: path.endsWith("publish") ? "POST" : "DELETE",
        json: { expectedRevision: saved.draft.revision },
        headers: { cookie: "", authorization: `Bearer ${writer.token}` },
      });
      assert.equal(denied.response.status, 403);
    }
    assert.deepEqual(await published(), before, "MCP draft changes altered the published export");
    const connections = (await ok("api/v1/account/mcp-connections")).body.items;
    const owned = connections.find((item) => item.clientName === "Alpha eight writer");
    assert.ok(owned);
    const revoked = await ok(`api/v1/account/mcp-connections/${owned.id}/revoke`, {
      method: "POST",
      json: {},
    });
    assert.equal(revoked.response.status, 204);
    await assert.rejects(writer.client.listTools());
    assert.equal((await reader.client.listTools()).tools.length, 3);
    const invitation = await ok("api/v1/admin/invitations", {
      method: "POST",
      json: { email: "alpha-eight-viewer@lace.test", role: "viewer" },
    });
    assert.equal(
      typeof invitation.body.link,
      "string",
      "alpha.8 invitation fallback link unavailable; disable fixture email delivery",
    );
    const invitationToken = new URLSearchParams(new URL(invitation.body.link).hash.slice(1)).get(
      "token",
    );
    secretValues.add(invitationToken);
    const viewerPassword = randomBytes(24).toString("hex");
    secretValues.add(viewerPassword);
    await ok("api/v1/invitations/accept", {
      method: "POST",
      json: { token: invitationToken, password: viewerPassword },
    });
    const administratorCookie = cookie;
    const viewerLogin = await ok("api/auth/sign-in/email", {
      method: "POST",
      json: { email: "alpha-eight-viewer@lace.test", password: viewerPassword },
    });
    cookie = viewerLogin.response.headers
      .getSetCookie()
      .map((value) => value.split(";")[0])
      .join("; ");
    secretValues.add(cookie);
    await assert.rejects(authorize(true), /HTTP 403/);
    const viewer = await authorize(false);
    assert.equal((await viewer.client.listTools()).tools.length, 3);
    cookie = administratorCookie;
    // The client helpers above are test drivers; application runtime resolution stays in the consumer.
    assert.ok((await readFile(join(project, "docs/lace-mcp.md"), "utf8")).includes("Gemini CLI"));
    if (run) await run("alpha-eight-site-typecheck", "pnpm", ["typecheck"], { cwd: project });
  } finally {
    await Promise.all(clients.map((client) => client.close()));
  }
  console.info(
    "Alpha eight saved consumer: default-off, OAuth/SDK scopes, draft queries, forbidden lifecycle, unchanged export and owned revocation passed",
  );
}

/** Render and activate the installed video source, with provider traffic intercepted. */
export async function verifyAlphaEightStarter(project, workspace) {
  const { createServer } = await import("node:http");
  const { resolve, extname } = await import("node:path");
  const { loadBrowser } = await import("./acceptance-browser.mjs");
  const root = resolve(project, "site/dist");
  const server = createServer(async (request, response) => {
    const path = resolve(root, `.${new URL(request.url, "http://local.test").pathname}`);
    if (!path.startsWith(`${root}/`)) {
      response.writeHead(404).end();
      return;
    }
    try {
      const bytes = await readFile(path.endsWith("/") ? `${path}index.html` : path);
      response.setHeader(
        "content-type",
        { ".js": "text/javascript", ".css": "text/css", ".html": "text/html" }[extname(path)] ??
          (path.endsWith("/") ? "text/html" : "application/octet-stream"),
      );
      response.end(bytes);
    } catch {
      response.writeHead(404).end();
    }
  });
  await new Promise((done) => server.listen(0, "127.0.0.1", done));
  let browser;
  try {
    browser = await loadBrowser(workspace);
    const page = await browser.newPage();
    await page.route(/https:\/\/(?:www\.youtube-nocookie\.com|player\.vimeo\.com)\//u, (route) =>
      route.fulfill({ contentType: "text/html", body: "<title>Intercepted provider</title>" }),
    );
    await page.goto(`http://127.0.0.1:${server.address().port}/blog/first-post/index.html`);
    const block = page.locator('[data-lace-block-key="about-vimeo"]');
    assert.equal(await block.locator("iframe").count(), 0);
    await block.locator('[data-lace-part="preview"]').click();
    assert.equal(await block.locator("iframe").count(), 1);
    assert.equal(await block.locator('[data-lace-part="preview"]').count(), 0);
    assert.ok((await block.locator("iframe").getAttribute("src")).includes("h=abc123def"));
    const untouched = page.locator('[data-lace-block-key="about-vimeo-second"]');
    assert.equal(await untouched.locator("iframe").count(), 0);
    const direct = page.locator('[data-lace-block-key="about-youtube"] iframe');
    assert.equal(await direct.getAttribute("loading"), "lazy");
    assert.equal(await page.locator('[data-lace-block="gallery"] [data-lace-layout]').count(), 1);
    await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);
    assert.equal(await page.locator('[data-lace-block-key="home-link-button"] a').count(), 0);
    assert.equal(
      await page
        .locator('[data-lace-block-key="home-link-button"] [data-lace-part="label"]')
        .count(),
      1,
    );
    assert.equal(
      await page.locator('[data-lace-block-key="home-link-text"] a').getAttribute("href"),
      "/blog/first-post",
    );
  } finally {
    await browser?.close();
    await new Promise((done) => server.close(done));
  }
  console.info(
    "Alpha eight packed starter: layout hooks, resolved/missing internal links and isolated video activation passed",
  );
}

/** A real TLS edge in front of the generated nginx, retaining production HTTPS checks. */
export async function alphaEightTlsProxy({ parent, upstream, run, workspace, secretValues }) {
  const { mkdir } = await import("node:fs/promises");
  const { createServer } = await import("node:https");
  const { request } = await import("node:http");
  const { createRequire } = await import("node:module");
  const directory = join(parent, "alpha-eight-tls");
  await mkdir(directory);
  const certificatePath = join(directory, "certificate.pem");
  const keyPath = join(directory, "key.pem");
  await run("alpha-eight-tls-certificate", "openssl", [
    "req",
    "-x509",
    "-newkey",
    "rsa:2048",
    "-nodes",
    "-days",
    "1",
    "-subj",
    "/CN=127.0.0.1",
    "-addext",
    "subjectAltName=IP:127.0.0.1",
    "-keyout",
    keyPath,
    "-out",
    certificatePath,
  ]);
  const key = await readFile(keyPath);
  const cert = await readFile(certificatePath);
  secretValues.add(key.toString());
  const server = createServer({ key, cert }, (incoming, outgoing) => {
    const proxy = request(
      new URL(incoming.url, upstream),
      { method: incoming.method, headers: incoming.headers },
      (response) => {
        outgoing.writeHead(response.statusCode, response.headers);
        response.pipe(outgoing);
      },
    );
    proxy.on("error", () => {
      if (!outgoing.headersSent) outgoing.writeHead(502);
      outgoing.end();
    });
    incoming.pipe(proxy);
  });
  await new Promise((done) => server.listen(0, "127.0.0.1", done));
  const require = createRequire(join(workspace, "apps/api/package.json"));
  const { Agent, fetch: undiciFetch } = createRequire(require.resolve("wrangler/package.json"))(
    "undici",
  );
  const dispatcher = new Agent({ connect: { ca: cert } });
  return {
    base: `https://127.0.0.1:${server.address().port}/`,
    fetch: (url, options) => undiciFetch(url, { ...options, dispatcher }),
    close: async () => {
      await dispatcher.close();
      server.closeAllConnections();
      await new Promise((done) => server.close(done));
    },
  };
}
