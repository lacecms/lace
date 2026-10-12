import type { ContentModelDto } from "@lacecms/contracts";
import { screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { useForm } from "react-hook-form";
import { describe, expect, test } from "vitest";
import { renderInRouter } from "../../../app/testing/index.js";
import type { DraftEditorValues, SeoSiteDefaults } from "../../../entities/content/index.js";
import { EntrySeoCard } from "./index.js";

const posts = {
  blocks: [],
  fields: {
    cover: { label: "Cover", required: false, type: "media" },
    excerpt: { label: "Excerpt", required: false, type: "textarea" },
  },
  key: "posts",
  kind: "collection",
  route: "/posts/:slug",
  seo: { description: "excerpt", image: "cover" },
  version: 1,
} as unknown as ContentModelDto;

const emptySeo = { canonical: "", description: "", image: null, noindex: false, title: "" };

function Harness({
  defaults,
  errors,
  fields = {},
  readOnly = false,
  seo = {},
  siteUrl,
}: {
  readonly defaults?: SeoSiteDefaults;
  readonly errors?: Parameters<typeof EntrySeoCard>[0]["errors"];
  readonly fields?: Record<string, unknown>;
  readonly readOnly?: boolean;
  readonly seo?: Partial<typeof emptySeo>;
  readonly siteUrl?: string;
}) {
  const form = useForm<DraftEditorValues, unknown, DraftEditorValues>({
    defaultValues: {
      blocks: [],
      fields,
      seo: { ...emptySeo, ...seo },
      slug: "hello",
      title: "Hello",
    },
  });
  return (
    <fieldset disabled={readOnly}>
      <EntrySeoCard
        control={form.control}
        defaults={defaults}
        errors={errors}
        model={posts}
        readOnly={readOnly}
        siteUrl={siteUrl}
      />
    </fieldset>
  );
}

describe("counters and soft warnings", () => {
  test("counts characters and warns above the recommendation without blocking", async () => {
    const user = userEvent.setup();
    renderInRouter(<Harness />);
    const title = await screen.findByRole("textbox", { name: "SEO title" });
    await user.type(title, "x".repeat(60));
    expect(screen.getByText("60 / 60 characters")).toBeInTheDocument();
    expect(screen.queryByText(/may shorten titles/u)).not.toBeInTheDocument();
    await user.type(title, "y");
    expect(screen.getByText("61 / 60 characters")).toBeInTheDocument();
    expect(title).toHaveAccessibleDescription(
      "61 / 60 characters Search results may shorten titles longer than 60 characters.",
    );
    await user.type(title, "{Backspace}{Backspace}");
    expect(screen.queryByText(/may shorten titles/u)).not.toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  test("warns about descriptions above 160 characters", async () => {
    renderInRouter(<Harness seo={{ description: "d".repeat(180) }} />);
    expect(await screen.findByText("180 / 160 characters")).toBeInTheDocument();
    expect(
      screen.getByText("Search results may shorten descriptions longer than 160 characters."),
    ).toBeInTheDocument();
  });
});

describe("inherited values", () => {
  test("shows placeholders for empty values as part of their descriptions", async () => {
    renderInRouter(
      <Harness
        defaults={{ description: "Notes on Lace", image: "media-9", siteName: "Lace" }}
        fields={{ excerpt: "A short intro" }}
        siteUrl="https://example.com/"
      />,
    );
    const title = await screen.findByRole("textbox", { name: "SEO title" });
    expect(title).toHaveAttribute("placeholder", "Uses entry title: Hello | Lace");
    expect(title).toHaveAccessibleDescription(/^Uses entry title: Hello \| Lace 0 \/ 60/u);
    expect(screen.getByRole("textbox", { name: "SEO description" })).toHaveAttribute(
      "placeholder",
      "Uses Excerpt: A short intro",
    );
    expect(screen.getByText("Uses the site image")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Canonical URL" })).toHaveAccessibleDescription(
      "Uses this page's URL: https://example.com/posts/hello",
    );
  });

  test("a stored value replaces the placeholder", async () => {
    renderInRouter(<Harness seo={{ title: "Stored" }} />);
    const title = await screen.findByRole("textbox", { name: "SEO title" });
    expect(title).not.toHaveAttribute("placeholder");
    expect(title).toHaveValue("Stored");
  });
});

describe("search-result preview", () => {
  test("follows typing and the hidden switch", async () => {
    const user = userEvent.setup();
    renderInRouter(
      <Harness
        defaults={{ siteName: "Lace", titleTemplate: "%s — Lace Notes" }}
        siteUrl="https://example.com/"
      />,
    );
    const preview = within(await screen.findByRole("region", { name: "Search result preview" }));
    expect(preview.getByText("Hello — Lace Notes")).toBeInTheDocument();
    expect(preview.getByText("https://example.com/posts/hello")).toBeInTheDocument();
    expect(
      preview.getByText("No description. Search engines choose a snippet from the page."),
    ).toBeInTheDocument();
    await user.type(screen.getByRole("textbox", { name: "SEO title" }), "Custom title");
    expect(preview.getByText("Custom title")).toBeInTheDocument();
    const noindex = screen.getByRole("switch", { name: "Hide from search engines" });
    expect(noindex).toHaveAccessibleDescription(
      "Adds noindex and leaves the page out of the sitemap.",
    );
    await user.click(noindex);
    expect(noindex).toBeChecked();
    expect(preview.getByText("Hidden from search results.")).toBeInTheDocument();
  });
});

test("shows errors on their controls", async () => {
  renderInRouter(
    <Harness
      errors={{ canonical: { message: "Enter an absolute URL." }, image: { message: "Choose." } }}
      seo={{ canonical: "/a" }}
    />,
  );
  const canonical = await screen.findByRole("textbox", { name: "Canonical URL" });
  expect(canonical).toHaveAttribute("aria-invalid", "true");
  expect(canonical).toHaveAccessibleDescription("Enter an absolute URL.");
  expect(screen.getByText("Choose.")).toHaveAttribute("role", "alert");
});

test("is read-only for viewers", async () => {
  renderInRouter(<Harness readOnly seo={{ title: "Stored" }} />, {
    session: { id: "viewer-1", role: "viewer" },
  });
  expect(await screen.findByRole("textbox", { name: "SEO title" })).toBeDisabled();
  expect(screen.getByRole("switch", { name: "Hide from search engines" })).toBeDisabled();
  expect(screen.queryByRole("button", { name: /Choose media/u })).not.toBeInTheDocument();
  expect(screen.getByRole("region", { name: "Search result preview" })).toBeInTheDocument();
});
