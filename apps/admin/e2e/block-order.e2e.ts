import { expect, test } from "@playwright/test";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { defineConfig, definePage } from "../../../packages/config/dist/index.js";
import { builtInBlocks } from "../../../packages/content/dist/index.js";
import { actorId, contentModelKey, unixMilliseconds } from "../../../packages/domain/dist/index.js";
import {
  applyPreparedConfigurationSynchronization,
  prepareConfigurationSynchronization,
} from "../../../packages/application/dist/index.js";
import {
  createNodeRuntime,
  migrateNodeDatabase,
  NodePlaceholderObjectStorage,
} from "../../../packages/platform-node/dist/index.js";
import type { ContentBlockDto } from "../../../packages/contracts/dist/index.js";
import { moveFirstHeroWithKeyboard } from "./helpers/block-order-keyboard.js";

// This fixture uses the production HTTP/use-case/SQLite path. Only identity and
// unused object storage are supplied by the test; no content responses are mocked.
test("block structural actions survive real saves, reloads, publication, export and Astro", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const directory = await mkdtemp(join(tmpdir(), "lace-block-order-"));
  const databasePath = join(directory, "lace.sqlite");
  const actor = { id: actorId("order-admin"), role: "admin" as const };
  const config = await defineConfig({
    blocks: [builtInBlocks.hero],
    content: [definePage({ key: "home", path: "/", blocks: ["hero"], version: 1 })],
  });
  migrateNodeDatabase(databasePath);
  const actors = { resolve: async () => actor };
  const runtime = createNodeRuntime({
    config,
    actors,
    auth: {
      actors,
      fetch: async () => Response.json({ user: { id: actor.id, role: actor.role } }),
    },
    storage: new NodePlaceholderObjectStorage(new URL("http://127.0.0.1:4173/")),
    logger: { log() {} },
    rateLimiter: { check: async () => true },
    settings: {
      authSecret: "block-order-regression-secret-32-characters",
      databasePath,
      host: "127.0.0.1",
      port: 0,
      publicBaseUrl: new URL("http://127.0.0.1:4173/"),
      adminDevOrigin: new URL("http://127.0.0.1:4173/"),
      minio: {
        accessKeyId: "unused",
        secretAccessKey: "unused",
        publicBaseUrl: new URL("http://127.0.0.1:4173/"),
        bucket: "unused",
        endpoint: new URL("http://127.0.0.1:9000"),
        region: "us-east-1",
        timeoutMs: 1000,
      },
    },
  });
  // The session summary reads the actor's persisted account, as for a real sign-in.
  runtime.database.connection
    .prepare(
      "insert into user (id, name, email, email_verified, role, disabled, created_at, updated_at) values (?, ?, ?, 0, ?, 0, 0, 0)",
    )
    .run(actor.id, "Order Admin", "order-admin@lace.test", actor.role);
  const server = createServer(async (incoming, outgoing) => {
    const result = await runtime.app.fetch(
      new Request(`http://127.0.0.1${incoming.url}`, {
        headers: incoming.headers as Record<string, string>,
      }),
    );
    outgoing.writeHead(result.status, Object.fromEntries(result.headers));
    outgoing.end(Buffer.from(await result.arrayBuffer()));
  });
  try {
    const clock = { now: () => unixMilliseconds(Date.now()) };
    let sequence = 0;
    await applyPreparedConfigurationSynchronization({
      clock,
      ids: { next: () => `order-id-${++sequence}` },
      models: config.runtime.content,
      prepared: await prepareConfigurationSynchronization({
        models: config.runtime.content,
        state: runtime.repository,
      }),
      target: runtime.repository,
    });
    const [initial] = (
      await runtime.content.list({ actor, modelKey: contentModelKey("home"), limit: 10 })
    ).items;
    expect(initial).toBeDefined();
    const entryId = initial!.id;
    const token = await runtime.security.createBuildToken({
      name: "order-build",
      now: clock.now(),
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (address === null || typeof address === "string") throw new Error("No fixture port");
    const apiOrigin = `http://127.0.0.1:${address.port}`;
    let rejectNext = false;
    let submitted: ContentBlockDto[] = [];
    await page.route(
      (url) => url.pathname.startsWith("/api/"),
      async (route) => {
        const request = route.request();
        const url = new URL(request.url());
        let body = request.postData();
        if (url.pathname.endsWith("/draft") && request.method() === "PUT") {
          const draft = request.postDataJSON() as { blocks: ContentBlockDto[] };
          submitted = draft.blocks;
          if (rejectNext) {
            // Exercise the real server's rejection by corrupting only this request.
            rejectNext = false;
            body = JSON.stringify({
              ...draft,
              blocks: draft.blocks.map((block) => ({ ...block, position: 1000 })),
            });
          }
        }
        const response = await runtime.app.fetch(
          new Request(`http://127.0.0.1:4173${url.pathname}${url.search}`, {
            method: request.method(),
            headers: request.headers(),
            ...(body === null ? {} : { body }),
          }),
        );
        await route.fulfill({
          status: response.status,
          headers: Object.fromEntries(response.headers),
          body: Buffer.from(await response.arrayBuffer()),
        });
      },
    );
    await page.goto(`/admin/content/home/${entryId}`);
    await expect(page.getByRole("heading", { name: "Edit home" })).toBeVisible();
    const cards = page.getByRole("article");
    const add = async (heading: string) => {
      await page.getByRole("button", { name: "Add block" }).click();
      await page
        .getByRole("dialog", { name: "Add block" })
        .getByRole("button", { name: "Hero" })
        .click();
      await cards.last().getByRole("textbox", { name: "Heading", exact: true }).fill(heading);
    };
    const keys = () =>
      cards.evaluateAll((elements) =>
        elements.map((element) => (element as HTMLElement).dataset.blockKey),
      );
    const values = () =>
      cards
        .getByRole("textbox", { name: "Heading", exact: true })
        .evaluateAll((elements) => elements.map((element) => (element as HTMLInputElement).value));
    const action = async (index: number, name: string) => {
      await cards.nth(index).getByRole("button", { name: "Actions for Hero block" }).click();
      await page.getByRole("menuitem", { name, exact: true }).click();
    };
    const prove = async () => {
      const expectedKeys = await keys();
      const expectedValues = await values();
      const beforeSave = await runtime.content.load({ actor, entryId });
      await page.getByRole("button", { name: "Save draft" }).click();
      await expect(
        page.getByText(`Saved revision ${beforeSave!.draft.revision + 1}`, { exact: true }),
      ).toBeVisible();
      await expect(page.getByRole("button", { name: "Save draft" })).toBeDisabled();
      expect(submitted.map((block) => block.position)).toEqual(
        expectedKeys.map((_, index) => (index + 1) * 1000),
      );
      await page.reload();
      await expect(cards).toHaveCount(expectedKeys.length);
      expect(await keys()).toEqual(expectedKeys);
      expect(await values()).toEqual(expectedValues);
      await page.getByRole("button", { name: "Publish", exact: true }).click();
      await page.getByRole("button", { name: "Confirm publication" }).click();
      await expect(page.getByText("Published. Build pending.")).toBeVisible();
      const exported = await runtime.app.fetch(
        new Request(`${apiOrigin}/api/v1/public/build-export`, {
          headers: { authorization: `Bearer ${token.token}` },
        }),
      );
      expect(exported.status).toBe(200);
      const data = await exported.json();
      expect(
        data.entries[0].entry.published.blocks.map((block: ContentBlockDto) => block.key),
      ).toEqual(expectedKeys);
      expect(
        data.entries[0].entry.published.blocks.map((block: ContentBlockDto) => block.data.heading),
      ).toEqual(expectedValues);
      // Async spawn keeps the fixture API responsive during the actual Astro build.
      await new Promise<void>((resolveBuild, rejectBuild) => {
        const child = spawn(
          "pnpm",
          ["exec", "astro", "build", "--outDir", join(directory, "site")],
          {
            cwd: resolve(import.meta.dirname, "../../site"),
            env: {
              ...process.env,
              ASTRO_TELEMETRY_DISABLED: "1",
              LACE_SITE_DATA_MODE: "live",
              LACE_API_BASE_URL: apiOrigin,
              LACE_BUILD_TOKEN: token.token,
            },
            stdio: ["ignore", "pipe", "pipe"],
          },
        );
        let output = "";
        child.stdout.on("data", (chunk) => {
          output += chunk;
        });
        child.stderr.on("data", (chunk) => {
          output += chunk;
        });
        child.on("error", rejectBuild);
        child.on("close", (code) =>
          code === 0
            ? resolveBuild()
            : rejectBuild(new Error(output.replaceAll(token.token, "[redacted]"))),
        );
      });
      const html = await readFile(join(directory, "site/index.html"), "utf8");
      expect(
        [...html.matchAll(/data-lace-block-key="([^"]+)"/gu)].map((match) => match[1]),
      ).toEqual(expectedKeys);
      for (const heading of expectedValues) expect(html).toContain(heading);
      return { expectedKeys, expectedValues };
    };
    await add("Order A");
    await add("Order B");
    await add("Order C");
    const originalKeys = await keys();
    await prove();

    // Pointer drag: move the first card below the second.
    const handle = cards.first().getByRole("button", { name: "Reorder Hero block" });
    const from = await handle.boundingBox();
    const target = await cards.nth(1).boundingBox();
    if (from === null || target === null) throw new Error("No drag bounds");
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(from.x + from.width / 2, target.y + target.height / 2, { steps: 20 });
    await page.mouse.up();
    await expect(cards.first().getByRole("textbox", { name: "Heading", exact: true })).toHaveValue(
      "Order B",
    );
    await prove();

    const keyboardOrder = await values();
    await moveFirstHeroWithKeyboard(page, cards);
    await expect(cards.first().getByRole("textbox", { name: "Heading", exact: true })).toHaveValue(
      keyboardOrder[1]!,
    );
    await prove();

    await page.getByRole("button", { name: "Insert block at position 2" }).click();
    await page
      .getByRole("dialog", { name: "Add block" })
      .getByRole("button", { name: "Hero" })
      .click();
    await cards
      .nth(1)
      .getByRole("textbox", { name: "Heading", exact: true })
      .fill("Order inserted");
    await prove();
    await action(1, "Duplicate");
    await expect(cards).toHaveCount(5);
    await cards
      .nth(2)
      .getByRole("textbox", { name: "Heading", exact: true })
      .fill("Order duplicate");
    expect(new Set(await keys()).size).toBe(5);
    await prove();

    const removedKey = (await keys())[2];
    await action(2, "Remove");
    await expect(cards).toHaveCount(4);
    await prove();
    // Remove/Undo is a separate operation before Save, restoring the original key/data.
    const beforeUndo = await keys();
    await action(1, "Remove");
    await expect(cards).toHaveCount(3);
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    await expect(cards).toHaveCount(4);
    expect(await keys()).toEqual(beforeUndo);
    expect(await keys()).not.toContain(removedKey);
    await cards
      .first()
      .getByRole("textbox", { name: "Heading", exact: true })
      .fill("Order A restored");
    await prove();
    for (const key of originalKeys) expect(await keys()).toContain(key);

    // Real ordering rejection retains all local work and has a successful retry.
    await cards
      .first()
      .getByRole("textbox", { name: "Heading", exact: true })
      .fill("Order A unsaved");
    const beforeRejection = await keys();
    rejectNext = true;
    await page.getByRole("button", { name: "Save draft" }).click();
    await expect(page.getByRole("alert").first()).toContainText("Block at index 1");
    await expect(
      page.getByText("Your unsaved changes are still here.", { exact: false }),
    ).toBeVisible();
    await page.getByText("Technical details", { exact: true }).click();
    await expect(page.getByText(/Request ID:/u)).toBeVisible();
    expect(await keys()).toEqual(beforeRejection);
    await expect(cards.first().getByRole("textbox", { name: "Heading", exact: true })).toHaveValue(
      "Order A unsaved",
    );
    await expect(page.getByRole("button", { name: "Copy my JSON" })).toBeVisible();
    await prove();
  } finally {
    await new Promise<void>((resolveClose) => server.close(() => resolveClose()));
    runtime.close();
    await rm(directory, { recursive: true, force: true });
  }
});
