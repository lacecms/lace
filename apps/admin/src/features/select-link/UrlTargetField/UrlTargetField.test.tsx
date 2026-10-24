import { screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { field, normalizeFieldDefinition } from "@lacecms/content";
import type { ContentModelDto } from "@lacecms/contracts";
import { useForm } from "react-hook-form";
import { expect, test, vi } from "vitest";
import { renderInRouter, stubClient } from "../../../app/testing/index.js";
import {
  FieldRenderer,
  FieldRendererProvider,
  type DraftEditorValues,
} from "../../../entities/content/index.js";
import { LinkAuthoringProvider, OrdinaryUrlField } from "./index.js";

const url = normalizeFieldDefinition(field.url({ label: "Destination" }));
const model: ContentModelDto = {
  fields: { url, nested: normalizeFieldDefinition(field.list({ item: field.url() })) },
  key: "posts",
  kind: "collection",
  label: "Posts",
  version: 1,
  route: "/posts/:slug",
  blockDefinitions: [{ type: "custom", version: 1, fields: { url } }],
  blocks: ["custom"],
} as ContentModelDto;
function Harness({
  readOnly = false,
  provider = false,
}: {
  readonly readOnly?: boolean;
  readonly provider?: boolean;
}) {
  const form = useForm<DraftEditorValues, unknown, DraftEditorValues>({
    defaultValues: {
      title: "",
      fields: { url: "entry:target", nested: ["entry:target", "entry:missing"] },
      blocks: [
        {
          key: "block",
          type: "custom",
          schemaVersion: 1,
          position: 1000,
          hidden: true,
          data: { url: "entry:target" },
          settings: { note: "entry:ignored" },
        },
      ],
    } as never,
  });
  return (
    <LinkAuthoringProvider form={form} model={model}>
      <FieldRendererProvider readOnly={readOnly} renderers={{ url: OrdinaryUrlField }}>
        <fieldset disabled={readOnly}>
          <FieldRenderer
            error={undefined}
            control={form.control}
            definition={
              provider ? normalizeFieldDefinition(field.url({ embedProviders: ["youtube"] })) : url
            }
            fieldKey="url"
            name="fields.url"
          />
        </fieldset>
        <output data-testid="stored">{JSON.stringify(form.watch())}</output>
      </FieldRendererProvider>
    </LinkAuthoringProvider>
  );
}

test("nested and hidden references share one deduplicated status batch; switching modes preserves stored values", async () => {
  const user = userEvent.setup();
  const resolveLinkTargets = vi.fn(async () => ({
    target: {
      id: "target",
      state: "published" as const,
      modelKey: "pages",
      modelKind: "page" as const,
      title: "Target page",
      path: "/current",
    },
    missing: { id: "missing", state: "missing" as const },
  }));
  renderInRouter(<Harness />, { client: stubClient({ resolveLinkTargets }) });
  await screen.findByRole("button", { name: "Destination" });
  expect(resolveLinkTargets).toHaveBeenCalledTimes(1);
  expect(resolveLinkTargets).toHaveBeenCalledWith(["missing", "target"], expect.any(AbortSignal));
  await user.click(screen.getByRole("button", { name: "Manual URL" }));
  expect(screen.getByTestId("stored")).toHaveTextContent("entry:target");
  await user.type(screen.getByRole("textbox", { name: "Destination" }), "/manual");
  expect(screen.getByTestId("stored")).toHaveTextContent('"url":"/manual"');
  expect(resolveLinkTargets).toHaveBeenCalledTimes(1);
  await user.click(screen.getByRole("button", { name: "CMS entry" }));
  expect(screen.getByTestId("stored")).toHaveTextContent('"url":"/manual"');
});

test("CMS selection stores only a canonical token and offers paginated destinations", async () => {
  const user = userEvent.setup();
  const listLinkTargets = vi.fn(async (query) =>
    query.after
      ? { items: [] }
      : {
          items: [
            {
              id: "a /日本",
              state: "published" as const,
              modelKey: "posts",
              modelKind: "collection" as const,
              title: "Article",
              path: "/article",
            },
          ],
          nextCursor: "next",
        },
  );
  renderInRouter(<Harness />, { client: stubClient({ listLinkTargets }) });
  await user.click(await screen.findByRole("button", { name: "Destination" }));
  const picker = screen.getByRole("dialog", { name: "Choose Destination destination" });
  await user.click(await within(picker).findByRole("button", { name: /Article/ }));
  expect(screen.getByTestId("stored")).toHaveTextContent("entry:a%20%2F%E6%97%A5%E6%9C%AC");
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Clear Destination" }));
  expect(screen.getByTestId("stored")).not.toHaveTextContent("entry:a%20");
});

test("viewers cannot switch, replace or clear and provider controls keep their original grammar", async () => {
  renderInRouter(<Harness readOnly />, { client: stubClient() });
  await waitFor(() => expect(screen.getByRole("button", { name: "CMS entry" })).toBeDisabled());
  expect(screen.getByRole("button", { name: "Clear Destination" })).toBeDisabled();
});
