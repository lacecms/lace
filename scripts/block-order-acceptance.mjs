import { loadBrowser, visible } from "./acceptance-browser.mjs";

/** The admin's explicit save resequences positions from the displayed order. */
export const savedPositions = (count) =>
  Array.from({ length: count }, (_, index) => (index + 1) * 1000);

/** `data-lace-block-key` values of rendered HTML, in document order. */
export function renderedBlockKeys(html) {
  return [...html.matchAll(/data-lace-block-key="([^"]+)"/gu)].map((match) => match[1]);
}

/**
 * Alpha.2 field-trial §1 (33A) in the packed consumer: the admin served by the
 * API image reorders (pointer and keyboard), inserts and duplicates in the
 * middle, removes and undoes removal; every step saves with ascending
 * positions, survives reload, publishes, reaches the build export in the
 * displayed order and is served by the Compose builder's static release in
 * that order. An intercepted save with equal positions is rejected by the real
 * server with the block-order explanation while local edits remain, and a
 * direct descending-position request is refused without changing the draft or
 * the published export.
 */
export async function blockOrderJourney(context, session, operations) {
  const { request, secretValues, waitBuild, workspace } = operations;
  const { base, cookie } = session;
  const servedBase = `http://127.0.0.1:${context.httpPort}/`;
  const headers = { cookie };
  console.info("Acceptance: block-order-entry");
  const created = await request(base, "/api/v1/admin/models/posts/entries", {
    method: "POST",
    headers,
    json: {
      blocks: [],
      fields: { summary: "Block order" },
      slug: "block-order",
      title: "Block order",
    },
  });
  const entryId = created.body?.id;
  if (typeof entryId !== "string") throw new Error("block-order-entry: entry ID missing");
  const issued = await request(base, "/api/v1/admin/api-tokens", {
    method: "POST",
    headers,
    json: { name: "block-order-export" },
  });
  const exportToken = issued.body?.token;
  if (typeof exportToken !== "string") throw new Error("block-order-entry: build token missing");
  secretValues.add(exportToken);
  const entry = async () =>
    (await request(base, `/api/v1/admin/entries/${entryId}`, { headers })).body;
  const exported = async () => {
    const response = await fetch(new URL("/api/v1/public/build-export", base), {
      headers: { authorization: `Bearer ${exportToken}` },
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) throw new Error(`block-order-export: status ${response.status}`);
    return response.json();
  };
  const exportedBlocks = (data) =>
    data.entries.find((item) => item.entry.id === entryId)?.entry.published?.blocks ?? [];

  const browser = await loadBrowser(workspace);
  try {
    const browserContext = await browser.newContext({ baseURL: base.slice(0, -1) });
    const page = await browserContext.newPage();
    let corruptNext = false;
    let submitted = [];
    await page.route(
      (url) => url.pathname.endsWith(`/entries/${entryId}/draft`),
      async (route) => {
        const outgoing = route.request();
        if (outgoing.method() !== "PUT") return route.continue();
        const draft = outgoing.postDataJSON();
        submitted = draft.blocks;
        if (!corruptNext) return route.continue();
        // Only this request is changed, so the packaged server itself rejects the order.
        corruptNext = false;
        return route.continue({
          postData: JSON.stringify({
            ...draft,
            blocks: draft.blocks.map((block) => ({ ...block, position: 1000 })),
          }),
        });
      },
    );

    console.info("Acceptance: block-order-login");
    await page.goto("/admin/");
    await page.getByRole("textbox", { name: "Email" }).fill(session.email);
    await page.getByLabel("Password", { exact: true }).fill(session.password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await visible(page.getByRole("heading", { name: "Content", exact: true }), "block-order-login");
    for (const value of await browserContext.cookies()) secretValues.add(value.value);
    await page.goto(`/admin/content/posts/${entryId}`);
    await visible(page.getByRole("button", { name: "Save draft" }), "block-order-editor");

    const cards = page.getByRole("article");
    const heading = (card) => card.getByRole("textbox", { name: "Heading", exact: true });
    const keys = () =>
      cards.evaluateAll((elements) => elements.map((element) => element.dataset.blockKey));
    const values = () =>
      cards
        .getByRole("textbox", { name: "Heading", exact: true })
        .evaluateAll((elements) => elements.map((element) => element.value));
    const add = async (text) => {
      await page.getByRole("button", { name: "Add block" }).click();
      await page
        .getByRole("dialog", { name: "Add block" })
        .getByRole("button", { name: "Hero" })
        .click();
      await heading(cards.last()).fill(text);
    };
    const action = async (index, name) => {
      await cards.nth(index).getByRole("button", { name: "Actions for Hero block" }).click();
      await page.getByRole("menuitem", { name, exact: true }).click();
    };
    const expectCount = async (count, stage) => {
      for (let attempt = 0; attempt < 100 && (await cards.count()) !== count; attempt++)
        await page.waitForTimeout(100);
      if ((await cards.count()) !== count) throw new Error(`${stage}: expected ${count} blocks`);
    };
    const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);

    /** Save, reload, publish, export and the served static release all keep the displayed order. */
    const prove = async (stage) => {
      console.info(`Acceptance: ${stage}`);
      const expectedKeys = await keys();
      const expectedValues = await values();
      const revision = (await entry()).draft.revision + 1;
      await page.getByRole("button", { name: "Save draft" }).click();
      await visible(page.getByText(`Saved revision ${revision}`, { exact: true }), stage);
      if (
        !same(
          submitted.map((block) => block.position),
          savedPositions(expectedKeys.length),
        )
      )
        throw new Error(`${stage}: saved positions do not follow the displayed order`);
      if (
        !same(
          submitted.map((block) => block.key),
          expectedKeys,
        )
      )
        throw new Error(`${stage}: saved keys differ from the displayed order`);
      await page.reload();
      await visible(page.getByRole("button", { name: "Save draft" }), stage);
      await expectCount(expectedKeys.length, stage);
      if (!same(await keys(), expectedKeys) || !same(await values(), expectedValues))
        throw new Error(`${stage}: reloaded draft lost the saved order`);
      await page.getByRole("button", { name: "Publish", exact: true }).click();
      await page.getByRole("button", { name: "Confirm publication" }).click();
      const deadline = Date.now() + 30_000;
      while ((await entry()).published?.revision !== revision) {
        if (Date.now() > deadline) throw new Error(`${stage}: publication not recorded`);
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
      const snapshot = await exported();
      const blocks = exportedBlocks(snapshot);
      if (
        !same(
          blocks.map((block) => block.key),
          expectedKeys,
        )
      )
        throw new Error(`${stage}: build export order differs from the displayed order`);
      if (
        !same(
          blocks.map((block) => block.data.heading),
          expectedValues,
        )
      )
        throw new Error(`${stage}: build export values differ from the displayed blocks`);
      // The publication's build row appears at dispatch; wait for one covering this version.
      const build = await waitBuild(
        session,
        (item) =>
          item.targetVersion >= snapshot.version && ["succeeded", "failed"].includes(item.status),
      );
      if (build.status !== "succeeded") throw new Error(`${stage}: Compose build ${build.status}`);
      const served = await fetch(new URL("/blog/block-order/", servedBase), {
        signal: AbortSignal.timeout(20_000),
      });
      const html = await served.text();
      if (!served.ok || !same(renderedBlockKeys(html), expectedKeys))
        throw new Error(
          `${stage}: served release order differs from the displayed order (${served.status}: ${JSON.stringify(renderedBlockKeys(html))} vs ${JSON.stringify(expectedKeys)})`,
        );
      for (const value of expectedValues)
        if (!html.includes(value)) throw new Error(`${stage}: served release lacks "${value}"`);
      return expectedKeys;
    };

    await add("Order A");
    await add("Order B");
    await add("Order C");
    const originalKeys = await prove("block-order-add");

    // Pointer drag: the first card moves below the second.
    const handle = cards.first().getByRole("button", { name: "Reorder Hero block" });
    const from = await handle.boundingBox();
    const target = await cards.nth(1).boundingBox();
    if (from === null || target === null) throw new Error("block-order-pointer: no drag bounds");
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(from.x + from.width / 2, target.y + target.height / 2, { steps: 20 });
    await page.mouse.up();
    if ((await heading(cards.first()).inputValue()) !== "Order B")
      throw new Error("block-order-pointer: drag did not reorder the blocks");
    await prove("block-order-pointer");

    const keyboardOrder = await values();
    const keyboardHandle = cards.first().getByRole("button", { name: "Reorder Hero block" });
    await keyboardHandle.scrollIntoViewIfNeeded();
    await keyboardHandle.focus();
    const liveRegion = page.locator("[id^=DndLiveRegion]").first();
    const waitFor = async (check, stage) => {
      for (let attempt = 0; attempt < 100; attempt++) {
        if (await check()) return;
        await page.waitForTimeout(100);
      }
      throw new Error(`${stage}: keyboard reordering did not respond`);
    };
    await keyboardHandle.press("Space");
    await waitFor(
      async () => (await keyboardHandle.getAttribute("aria-pressed")) === "true",
      "block-order-keyboard-pick",
    );
    await page.keyboard.press("ArrowDown");
    await waitFor(
      async () => (await liveRegion.textContent())?.includes("moved to position 2 of 3") === true,
      "block-order-keyboard-move",
    );
    await page.keyboard.press("Space");
    await waitFor(
      async () => (await liveRegion.textContent())?.includes("dropped at position 2 of 3") === true,
      "block-order-keyboard-drop",
    );
    if ((await heading(cards.first()).inputValue()) !== keyboardOrder[1])
      throw new Error("block-order-keyboard: keyboard move did not reorder the blocks");
    await prove("block-order-keyboard");

    await page.getByRole("button", { name: "Insert block at position 2" }).click();
    await page
      .getByRole("dialog", { name: "Add block" })
      .getByRole("button", { name: "Hero" })
      .click();
    await heading(cards.nth(1)).fill("Order inserted");
    await prove("block-order-insert");

    await action(1, "Duplicate");
    await expectCount(5, "block-order-duplicate");
    await heading(cards.nth(2)).fill("Order duplicate");
    if (new Set(await keys()).size !== 5) throw new Error("block-order-duplicate: key reused");
    await prove("block-order-duplicate");

    await action(2, "Remove");
    await expectCount(4, "block-order-remove");
    await prove("block-order-remove");

    const beforeUndo = await keys();
    await action(1, "Remove");
    await expectCount(3, "block-order-undo");
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    await expectCount(4, "block-order-undo");
    if (!same(await keys(), beforeUndo)) throw new Error("block-order-undo: order not restored");
    await heading(cards.first()).fill("Order A restored");
    const restored = await prove("block-order-undo");
    for (const key of originalKeys.filter((key) => beforeUndo.includes(key)))
      if (!restored.includes(key)) throw new Error("block-order-undo: original key lost");

    console.info("Acceptance: block-order-rejected-save");
    await heading(cards.first()).fill("Order A unsaved");
    const beforeRejection = await keys();
    const unchanged = await entry();
    corruptNext = true;
    await page.getByRole("button", { name: "Save draft" }).click();
    await visible(
      page.getByRole("alert").filter({ hasText: "Block at index 1" }),
      "block-order-rejected-save",
    );
    await visible(
      page.getByText("Your unsaved changes are still here.", { exact: false }),
      "block-order-rejected-save",
    );
    await visible(page.getByRole("button", { name: "Copy my JSON" }), "block-order-rejected-save");
    if (!same(await keys(), beforeRejection))
      throw new Error("block-order-rejected-save: local order changed after rejection");
    if ((await heading(cards.first()).inputValue()) !== "Order A unsaved")
      throw new Error("block-order-rejected-save: local edit lost after rejection");
    if ((await entry()).draft.revision !== unchanged.draft.revision)
      throw new Error("block-order-rejected-save: rejected save advanced the draft");
    await prove("block-order-retry");
  } finally {
    await browser.close();
  }

  console.info("Acceptance: block-order-descending-rejected");
  const current = await entry();
  const before = JSON.stringify(await exported());
  const response = await fetch(new URL(`/api/v1/admin/entries/${entryId}/draft`, base), {
    method: "PUT",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({
      blocks: current.draft.blocks.map((block, index, all) => ({
        ...block,
        position: (all.length - index) * 1000,
      })),
      expectedRevision: current.draft.revision,
      fields: current.draft.fields,
      slug: current.draft.slug,
      title: current.draft.title,
    }),
    signal: AbortSignal.timeout(20_000),
  });
  const body = await response.json().catch(() => undefined);
  const requestId = response.headers.get("x-request-id");
  if (
    response.status !== 422 ||
    body?.error?.code !== "CONTENT_INVALID_STATE" ||
    !/Block at index/u.test(body?.error?.message ?? "") ||
    !requestId
  )
    throw new Error(
      `block-order-descending-rejected: expected a safe 422 block-order rejection, got ${response.status} ${JSON.stringify(body)}`,
    );
  if ((await entry()).draft.revision !== current.draft.revision)
    throw new Error("block-order-descending-rejected: rejected draft advanced the revision");
  if (JSON.stringify(await exported()) !== before)
    throw new Error("block-order-descending-rejected: rejected draft changed the export");
  console.info(
    "Block order in the packed admin: pointer, keyboard, insert, duplicate, remove and undo saved, reloaded, published, exported and served in the displayed order; rejected orders kept local edits and changed nothing",
  );
}
