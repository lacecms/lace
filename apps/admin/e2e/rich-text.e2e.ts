import { expect, test, type Page } from "@playwright/test";
import { field } from "@lacecms/content";
import { itemAction, openAllItems } from "./support/list-items.js";
import { sessionPath, sessionSummary } from "./support/session.js";
import { AxeBuilder } from "@axe-core/playwright";

const expanded: import("@tiptap/core").JSONContent = {
  type: "doc",
  content: [
    { type: "heading", attrs: { level: 4 }, content: [{ type: "text", text: "Fourth heading" }] },
    { type: "horizontalRule" },
    { type: "codeBlock", content: [{ type: "text", text: "\t  <code> &\n line two\n" }] },
    {
      type: "paragraph",
      content: [
        {
          type: "text",
          text: "Link text",
          marks: [{ type: "link", attrs: { href: "/docs", target: "_blank", rel: "nofollow" } }],
        },
      ],
    },
  ],
};
async function mock(page: Page, role: "admin" | "viewer" = "admin") {
  const list = field.list({
    label: "Sections",
    item: field.group({ fields: { body: field.richText({ label: "Body" }) } }),
  });
  const model = {
    key: "posts",
    kind: "collection",
    route: "/posts/:slug",
    version: 1,
    fields: { sections: list },
    blocks: ["richText"],
    blockDefinitions: [
      { type: "richText", label: "Rich text", version: 1, fields: { sections: list } },
    ],
  };
  let current = {
    id: "entry-1",
    updatedBy: { id: "admin-1", displayName: "Admin" },
    model: { key: "posts", kind: "collection", route: "/posts/:slug" },
    draft: {
      id: "snapshot-1",
      entryId: "entry-1",
      state: "draft",
      title: "Expanded",
      slug: "expanded",
      revision: 1,
      createdAt: "2026-10-13T00:00:00.000Z",
      updatedAt: "2026-10-13T00:00:00.000Z",
      updatedBy: { id: "admin-1", role: "admin" },
      fields: {
        sections: [
          { body: expanded },
          {
            body: {
              type: "doc",
              content: [{ type: "paragraph", content: [{ type: "text", text: "Second" }] }],
            },
          },
        ],
      },
      blocks: [
        {
          key: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
          type: "richText",
          schemaVersion: 1,
          position: 1000,
          hidden: false,
          settings: {},
          data: { sections: [{ body: expanded }] },
        },
      ],
    },
  };
  const saves: unknown[] = [];
  let reject = false;
  await page.route(
    (url) => url.pathname.startsWith("/api/"),
    async (route) => {
      const request = route.request(),
        path = new URL(request.url()).pathname;
      const json = (body: unknown, status = 200) =>
        route.fulfill({ status, body: JSON.stringify(body), contentType: "application/json" });
      if (path === sessionPath) return json(sessionSummary({ id: `${role}-1`, role }));
      if (path === "/api/v1/admin/content-models") return json({ items: [model] });
      if (path === "/api/v1/admin/entries/entry-1") return json(current);
      if (path.endsWith("/draft")) {
        saves.push(request.postDataJSON());
        if (reject)
          return json(
            { error: { code: "CONTENT_REVISION_CONFLICT", message: "The draft has changed." } },
            409,
          );
        const { expectedRevision: _revision, ...draft } = request.postDataJSON();
        current = {
          ...current,
          draft: { ...current.draft, ...draft, revision: current.draft.revision + 1 },
        };
        return json(current);
      }
      return route.fallback();
    },
  );
  return {
    saves,
    current: () => current,
    reject: () => {
      reject = true;
    },
  };
}

test("expanded documents survive nested moves, disclosures, tabs and save/reload", async ({
  page,
}) => {
  const state = await mock(page);
  await page.goto("/admin/content/posts/entry-1");
  await openAllItems(page);
  const body = page.locator('[id^="field-fields-"][role="textbox"]').first();
  await expect(body.locator("h4")).toHaveText("Fourth heading");
  await expect(body.locator("pre")).toHaveText(expanded.content![2]!.content![0]!.text!);
  await expect(page.getByRole("button", { name: "Save draft" })).toBeDisabled();
  // Nested leaves share the same toolbar and preserve the instance through list movement.
  await body.click();
  await page.keyboard.press("ControlOrMeta+End");
  await page.keyboard.type(" edited");

  await itemAction(page, "Sections item 1", "Move down", { last: true });
  // Keyboard activation: rows animate into their new places after a move.
  await page.getByRole("button", { name: "Collapse Sections item 2", exact: true }).last().focus();
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: "Expand Sections item 2", exact: true }).last().focus();
  await page.keyboard.press("Enter");
  const moved = page.locator('[id^="field-fields-"][role="textbox"]').nth(1);
  await expect(moved).toContainText("edited");
  await moved.focus();
  await page.keyboard.press("ControlOrMeta+z");
  await expect(moved).not.toContainText("edited");
  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect(moved).toContainText("edited");
  const block = page.getByRole("article");
  await block.getByRole("tab", { name: "Settings", exact: true }).click();
  await expect(page.getByRole("toolbar", { name: "Body selection formatting" })).toBeHidden();
  await block.getByRole("tab", { name: "Content", exact: true }).click();
  await expect(block.getByRole("textbox", { name: "Body" }).locator("h4")).toHaveText(
    "Fourth heading",
  );
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByText("Saved revision 2")).toBeVisible();
  await page.reload();
  await openAllItems(page);
  expect(state.current().draft.fields.sections[1]!.body.content![0]).toEqual(expanded.content![0]);
  await expect(page.locator('[id^="field-fields-"][role="textbox"]').nth(1)).toContainText(
    "edited",
  );
  await expect(page.getByRole("button", { name: "Save draft" })).toBeDisabled();
});

test("selection menu and link switches preserve text and support keyboard dismissal", async ({
  page,
}) => {
  const state = await mock(page);
  await page.goto("/admin/content/posts/entry-1");
  await openAllItems(page);
  const body = page.locator('[id^="field-fields-"][role="textbox"]').first();
  await body.click();
  await page.keyboard.press("ControlOrMeta+End");
  await page.keyboard.press("Home");
  await page.keyboard.press("Shift+End");
  const bubble = page.getByRole("toolbar", { name: "Body selection formatting" });
  await expect(bubble).toBeVisible();
  await expect(body).toBeFocused();
  await bubble.getByRole("button", { name: "Bold", exact: true }).click();
  await expect(body.locator("strong")).toHaveText("Link text");
  await bubble.getByRole("button", { name: "Link", exact: true }).click();
  await expect(page.getByLabel("Link URL")).toBeFocused();
  await expect(page.getByRole("switch", { name: "Open in a new tab" })).toBeChecked();
  await expect(page.getByRole("switch", { name: "nofollow" })).toBeChecked();
  await page.getByRole("switch", { name: "Open in a new tab" }).press("Space");
  const audit = await new AxeBuilder({ page })
    .include('[role="dialog"]')
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(audit.violations).toEqual([]);
  await page.getByRole("button", { name: "Apply", exact: true }).press("Enter");
  await expect(body).toBeFocused();
  await expect(body.locator("a")).not.toHaveAttribute("target");
  await expect(body.locator("a")).toHaveAttribute("rel", "nofollow");
  await expect(bubble).toBeVisible();
  await bubble.getByRole("button", { name: "Bold", exact: true }).focus();
  await page.keyboard.press("Escape");
  await expect(bubble).toBeHidden();
  await expect(body).toBeFocused();
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByText("Saved revision 2")).toBeVisible();
  const attrs =
    state.current().draft.fields.sections[0]!.body.content![3]!.content![0]!.marks![0]!.attrs;
  expect(attrs).toEqual({ href: "/docs", rel: "nofollow" });
  await page.reload();
  await openAllItems(page);
  await expect(body.locator("a")).toHaveAttribute("rel", "nofollow");
});

test("viewers preserve expanded content and cannot open formatting controls", async ({ page }) => {
  const state = await mock(page, "viewer");
  await page.goto("/admin/content/posts/entry-1");
  await openAllItems(page);
  const body = page.locator('[id^="field-fields-"][role="textbox"]').first();
  await expect(body).toHaveAttribute("contenteditable", "false");
  await expect(body.locator("h4")).toHaveText("Fourth heading");
  await body.focus();
  await page.keyboard.press("ControlOrMeta+k");
  await expect(page.getByLabel("Link URL")).toHaveCount(0);
  await expect(page.getByRole("toolbar", { name: /Body.*formatting/ })).toHaveCount(0);
  expect(state.saves).toEqual([]);
});

test("fixed toolbar creates H4, code and rules; history, paste and removal stay safe", async ({
  page,
}) => {
  const state = await mock(page);
  await page.goto("/admin/content/posts/entry-1");
  await openAllItems(page);
  const body = page.locator('[id^="field-fields-"][role="textbox"]').first();
  const toolbar = page.getByRole("toolbar", { name: "Body formatting", exact: true }).nth(1);
  // Replace through the editor's selection command; browser fill can leave atomic rules behind.
  await body.click();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.insertText("Authoring");
  await expect(body.locator("hr")).toHaveCount(0);
  await toolbar.getByRole("combobox", { name: "Text style" }).click();
  await page.getByRole("option", { name: "Heading 4", exact: true }).click();
  await expect(body.locator("h4")).toHaveText("Authoring");
  await toolbar.getByRole("button", { name: "Code block", exact: true }).click();
  await expect(body.locator("pre code")).toHaveText("Authoring");
  await expect(toolbar.getByRole("button", { name: "Link", exact: true })).toBeDisabled();
  await body.locator("pre code").evaluate((element) => {
    (element.closest('[contenteditable="true"]') as HTMLElement).focus();
    const range = document.createRange();
    range.selectNodeContents(element);
    range.collapse(false);
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
    document.dispatchEvent(new Event("selectionchange"));
  });
  await page.keyboard.type("  <plain>");
  await expect(body.locator("pre code")).toHaveText("Authoring  <plain>");
  await page.keyboard.press("Enter");
  await page.keyboard.insertText("\tcode");
  await expect(body.locator("pre code")).toHaveText("Authoring  <plain>\n\tcode");
  // Tiptap groups history within 500ms; isolate this action from preceding typing.
  await page.waitForTimeout(600);
  await toolbar.getByRole("button", { name: "Insert horizontal rule" }).click();
  await expect(body.locator("hr")).toHaveCount(1);
  await expect(body).toBeFocused();
  await page.keyboard.press("ControlOrMeta+z");
  await expect(body.locator("hr")).toHaveCount(0);
  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect(body.locator("hr")).toHaveCount(1);
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByText("Saved revision 2")).toBeVisible();
  expect(JSON.stringify(state.saves)).not.toContain('"language"');
  await page.reload();
  await openAllItems(page);
  await expect(body.locator("hr")).toHaveCount(1);
  // Ordinary paste uses the same editor parser, including removal of unsafe links/styles.
  await body.fill("Paste here");
  await body.focus();
  await page.keyboard.press("ControlOrMeta+a");
  await body.evaluate((element) => {
    const clipboardData = new DataTransfer();
    clipboardData.setData(
      "text/html",
      '<h4 style="color:red">Pasted</h4><p><a href="javascript:alert(1)">unsafe</a> <strong>safe</strong></p>',
    );
    element.dispatchEvent(
      new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData }),
    );
  });
  await expect(body.locator("h4")).toHaveText("Pasted");
  await expect(body.locator("a")).toHaveCount(0);
  await expect(body.locator("strong")).toHaveText("safe");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByText("Saved revision 3")).toBeVisible();
  expect(JSON.stringify(state.saves.at(-1))).not.toContain("javascript");
});

test("revision conflicts retain expanded local content until explicit reload", async ({ page }) => {
  const state = await mock(page);
  await page.goto("/admin/content/posts/entry-1");
  await openAllItems(page);
  const body = page.locator('[id^="field-fields-"][role="textbox"]').first();
  await body.locator("p").last().click();
  await page.keyboard.press("End");
  await page.keyboard.type(" local");
  state.reject();
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByRole("alert")).toContainText("Draft changed elsewhere");
  await expect(body.locator("h4")).toHaveText("Fourth heading");
  await expect(body.locator("hr")).toHaveCount(1);
  await expect(body.locator("pre")).toHaveText(expanded.content![2]!.content![0]!.text!);
  await expect(body).toContainText(" local");
  await page.getByRole("button", { name: "Reload server draft" }).click();
  await expect(body).not.toContainText(" local");
  await expect(body.locator("h4")).toHaveText("Fourth heading");
});
