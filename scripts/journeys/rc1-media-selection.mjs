import assert from "node:assert/strict";
import { loadBrowser, visible } from "../acceptance-browser.mjs";

/** Uses the saved consumer's API/admin, with Playwright only as the test driver. */
export async function rc1MediaSelection({ base, cookie, workspace, png, ok }) {
  const ids = [];
  for (const name of ["rc1-picker-a.png", "rc1-picker-b.png"]) {
    const form = new FormData();
    form.append("file", new Blob([png], { type: "image/png" }), name);
    form.append("tags", " RC1-Picker ");
    const uploaded = await ok("api/v1/admin/media", { method: "POST", body: form });
    assert.deepEqual(uploaded.body.tags, ["rc1-picker"]);
    ids.push(uploaded.body.id);
  }
  const tagged = (await ok("api/v1/admin/media?tag=rc1-picker")).body.items;
  assert.deepEqual(new Set(tagged.map((item) => item.id)), new Set(ids));
  const entry = (
    await ok("api/v1/admin/models/posts/entries", {
      method: "POST",
      json: {
        title: "RC1 picker draft",
        slug: "rc1-picker",
        fields: {},
        blocks: [
          {
            key: `01J${"901".padStart(23, "0")}`,
            type: "gallery",
            schemaVersion: 5,
            position: 1024,
            data: { images: [] },
          },
        ],
      },
    })
  ).body;
  const browser = await loadBrowser(workspace);
  try {
    const context = await browser.newContext({ ignoreHTTPSErrors: true });
    await context.addCookies(
      cookie.split(";").map((part) => {
        const value = part.trim();
        const separator = value.indexOf("=");
        return {
          name: value.slice(0, separator),
          value: value.slice(separator + 1),
          url: base,
          secure: new URL(base).protocol === "https:",
        };
      }),
    );
    const page = await context.newPage();
    await page.goto(new URL(`admin/content/posts/${entry.id}`, base).href);
    await page.getByRole("button", { name: "Add Images and videos item", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Add media to Images and videos" });
    await visible(dialog, "rc1-multi-picker");
    for (const name of ["rc1-picker-b.png", "rc1-picker-a.png"])
      await dialog.getByRole("button", { name, exact: true }).click();
    await dialog.getByRole("button", { name: "Add 2 images", exact: true }).click();
    await dialog.waitFor({ state: "detached" });
    const details = page.getByRole("switch", { name: "Show details", exact: true });
    await details.click();
    await page
      .getByRole("textbox", { name: "Conditional note", exact: true })
      .fill("Retained hidden picker note");
    await details.click();
    assert.equal(
      await page.getByRole("textbox", { name: "Conditional note", exact: true }).count(),
      0,
    );
    await page.getByRole("button", { name: "Save draft", exact: true }).click();
    await visible(page.getByText("Saved revision 2", { exact: true }), "rc1-picker-save");
    await page.reload();
    await visible(
      page.getByRole("button", { name: "Save draft", exact: true }),
      "rc1-picker-reload",
    );
    const saved = (await ok(`api/v1/admin/entries/${entry.id}`)).body;
    assert.deepEqual(
      saved.draft.blocks[0].data.images.map((item) => item.media),
      [...ids].reverse(),
    );
    assert.equal(saved.draft.fields.conditionalNote, "Retained hidden picker note");
    assert.equal(saved.draft.fields.hasDetails, false);
  } finally {
    await browser.close();
  }
  console.info(
    "RC1 saved admin: media tags, ordered multi-selection and hidden draft retention passed",
  );
}
