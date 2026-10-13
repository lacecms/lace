import { expect, test, type Page } from "@playwright/test";
import { field } from "@lacecms/content";
import { sessionPath, sessionSummary } from "./support/session.js";
import { expectNoAccessibilityViolations } from "./support/accessibility.js";

async function mock(page: Page, role: "admin" | "viewer") {
  const fields = {
    details: field.group({
      label: "Details",
      required: true,
      fields: {
        title: field.text({
          label: "Short title",
          required: true,
          maxLength: 4,
          placeholder: "Your title",
        }),
        summary: field.textarea({ label: "Summary", placeholder: "A summary", minLength: 2 }),
        url: field.url({ label: "Address", placeholder: "https://example.test" }),
        category: field.select({
          label: "Category",
          required: true,
          options: ["news", "guide"],
          placeholder: "Choose category",
        }),
        amount: field.number({ label: "Amount", min: 1, max: 5, placeholder: "1 to 5" }),
        ready: field.boolean({ label: "Ready", required: true }),
        image: field.media({
          label: "Image",
          required: true,
          description: "Choose a cover image.",
        }),
        body: field.richText({ label: "Body", required: true, placeholder: "Tell the story" }),
        tags: field.list({
          label: "Tags",
          minItems: 2,
          maxItems: 5,
          item: field.text({ placeholder: "Tag" }),
        }),
      },
    }),
  };
  const model = {
    key: "posts",
    kind: "collection",
    route: "/posts/:slug",
    version: 1,
    fields,
    blocks: ["card"],
    blockDefinitions: [
      {
        type: "card",
        label: "Card",
        version: 1,
        fields,
        settings: {
          tone: field.text({
            label: "Tone",
            placeholder: "Tone prompt",
            defaultValue: "normal",
            maxLength: 10,
          }),
        },
      },
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
      title: "Guidance",
      slug: "guidance",
      revision: 1,
      createdAt: "2026-10-13T00:00:00.000Z",
      updatedAt: "2026-10-13T00:00:00.000Z",
      updatedBy: { id: "admin-1", role: "admin" },
      fields: { details: { tags: ["a", "long"] } },
      blocks: [
        {
          key: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
          type: "card",
          schemaVersion: 1,
          position: 1000,
          hidden: false,
          data: { details: { tags: [] } },
          settings: { tone: "normal" },
        },
      ],
    },
  };
  const saves: unknown[] = [];
  await page.route(
    (url) => url.pathname.startsWith("/api/"),
    async (route) => {
      const path = new URL(route.request().url()).pathname;
      const json = (body: unknown) =>
        route.fulfill({ body: JSON.stringify(body), contentType: "application/json" });
      if (path === sessionPath) return json(sessionSummary({ id: `${role}-1`, role }));
      if (path === "/api/v1/admin/content-models") return json({ items: [model] });
      if (path === "/api/v1/admin/entries/entry-1") return json(current);
      if (path.endsWith("/draft")) {
        const { expectedRevision: _revision, ...draft } = route.request().postDataJSON();
        saves.push(draft);
        current = {
          ...current,
          draft: { ...current.draft, ...draft, revision: current.draft.revision + 1 },
        };
        return json(current);
      }
      return route.fallback();
    },
  );
  return { saves };
}

for (const width of [1280, 390])
  for (const role of ["admin", "viewer"] as const) {
    test(`CE9A guidance and counters ${role} at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      const state = await mock(page, role);
      await page.goto("/admin/content/posts/entry-1");
      const title = page.locator("#field-fields-details-title");
      await expect(title).toHaveAttribute("placeholder", "Your title");
      await expect(title).toHaveAccessibleDescription(
        "Required for publication only. Limit: 4 characters. 0 characters",
      );
      await expect(page.locator("#field-fields-details-category")).toHaveText("Choose category");
      await expect(page.locator("#field-fields-details-amount")).toHaveAttribute(
        "placeholder",
        "1 to 5",
      );
      await expect(page.locator("#field-fields-details-ready")).toHaveAccessibleDescription(
        "Required for publication only.",
      );
      const body = page.locator("#field-fields-details-body");
      if (role === "viewer") {
        await expect(body).not.toHaveAttribute("aria-placeholder");
        await expect(page.getByRole("button", { name: "Save draft" })).toHaveCount(0);
        await expect(page.getByRole("button", { name: "Choose Image" })).toHaveCount(0);
      } else {
        await expect(body).toHaveAttribute("aria-placeholder", "Tell the story");
        await expect(body.locator("p")).toHaveAttribute("data-placeholder", "Tell the story");
        await expect(page.getByRole("button", { name: "Save draft" })).toBeDisabled();
        await title.focus();
        await page.keyboard.type("12345");
        await expect(title).toHaveValue("12345");
        await expect(title).toHaveAccessibleDescription(/5 characters/u);
        await page.getByRole("button", { name: "Save draft" }).click();
        await expect(title).toHaveAttribute("aria-invalid", "true");
        expect(state.saves).toHaveLength(0);
        await title.fill(" 😀 ");
        await page
          .getByRole("button", { name: "Move down Tags item 1", exact: true })
          .last()
          .click();
        const tag = page.locator('[id="field-fields-details-tags-0"]');
        await expect(tag).toHaveValue("long");
        await expect(tag).toHaveAccessibleDescription("4 characters");
        const block = page.getByRole("article");
        await block.getByRole("tab", { name: "Settings", exact: true }).click();
        const tone = block.getByRole("textbox", { name: "Tone", exact: true });
        await expect(tone).toHaveAttribute("placeholder", "Tone prompt");
        await expect(tone).toHaveAccessibleDescription("Limit: 10 characters. 6 characters");
        await block.getByRole("tab", { name: "Content", exact: true }).click();
        await page.getByRole("button", { name: "Save draft" }).click();
        await expect(page.getByText("Saved revision 2")).toBeVisible();
        expect(state.saves).toHaveLength(1);
        expect(JSON.stringify(state.saves)).not.toContain("placeholder");
        await page.reload();
        await expect(title).toHaveValue(" 😀 ");
        await expect(title).toHaveAccessibleDescription(/4 characters/u);
      }
      await page.getByRole("button", { name: "Collapse Details", exact: true }).last().focus();
      await page.keyboard.press("Enter");
      await page.getByRole("button", { name: "Expand Details", exact: true }).last().press("Enter");
      const broken = await page
        .locator("[aria-describedby]")
        .evaluateAll((elements) =>
          elements.flatMap((element) =>
            (element.getAttribute("aria-describedby") ?? "")
              .split(/\s+/u)
              .filter((id) => id && !document.getElementById(id)),
          ),
        );
      expect(broken).toEqual([]);
      await expectNoAccessibilityViolations(page, `CE9A ${role} ${width}`);
    });
  }
