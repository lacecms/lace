import { field } from "@lacecms/content";
import type { ContentModelDto } from "@lacecms/contracts";
import { screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { useForm } from "react-hook-form";
import { expect, test, vi } from "vitest";
import { renderInRouter, stubClient } from "../../../app/testing/index.js";
import { fieldEditorServices, type DraftEditorValues } from "../../../entities/content/index.js";
import { FieldRenderer, FieldRendererProvider } from "../../../entities/field-editor/index.js";
import { ReferenceAuthoringProvider, ReferenceField } from "./index.js";
import { ReferencePicker } from "../ReferencePicker/index.js";

const ref = field.reference({ label: "Review", models: ["reviews", "articles"] });
const reviews = field.list({ label: "Reviews", item: ref, maxItems: 3 });
const model: ContentModelDto = {
  key: "settings",
  label: "Settings",
  kind: "global",
  version: 1,
  fields: { review: ref, reviews },
  blocks: ["hero"],
  blockDefinitions: [{ type: "hero", version: 1, fields: { review: ref } }],
};
const alpha = {
  id: "a",
  title: "Alpha",
  modelKey: "reviews",
  modelKind: "collection",
  state: "published",
} as const;
const beta = { ...alpha, id: "b", title: "Beta", state: "unpublished" } as const;

function Harness({ readOnly = false, links = [] }: { readOnly?: boolean; links?: string[] }) {
  const linkedModel = {
    ...model,
    fields: {
      ...model.fields,
      links: field.list({ item: field.url(), maxItems: 100 }),
      moreLinks: field.list({ item: field.url(), maxItems: 100 }),
    },
  };
  const defaultValues: DraftEditorValues = {
    title: "Settings",
    fields: { review: "a", reviews: [], links: links.slice(0, 100), moreLinks: links.slice(100) },
    blocks: [
      {
        key: "hero-1",
        type: "hero",
        hidden: true,
        position: 1000,
        schemaVersion: 1,
        data: { review: "a" },
        settings: {},
      },
    ],
  };
  const form = useForm<DraftEditorValues, unknown, DraftEditorValues>({
    defaultValues: defaultValues as never,
  });
  const values = form.watch();
  return (
    <ReferenceAuthoringProvider form={form} model={linkedModel}>
      <FieldRendererProvider
        editor={{ form, model: linkedModel }}
        readOnly={readOnly}
        referenceListPicker={ReferencePicker}
        renderers={{ reference: ReferenceField }}
        services={fieldEditorServices}
      >
        <FieldRenderer
          control={form.control}
          definition={ref}
          error={undefined}
          fieldKey="review"
          name="fields.review"
        />
        <FieldRenderer
          control={form.control}
          definition={reviews}
          error={undefined}
          fieldKey="reviews"
          name="fields.reviews"
        />
        <output data-testid="values">{JSON.stringify(values.fields.reviews)}</output>
        <output data-testid="dirty">{String(form.formState.isDirty)}</output>
      </FieldRendererProvider>
    </ReferenceAuthoringProvider>
  );
}

test("chooses a later draft-only page and appends repeated route-less selections in order", async () => {
  const user = userEvent.setup();
  const resolveReferenceTargets = vi.fn(async () => ({ a: alpha, b: beta }));
  const listReferenceTargets = vi.fn(async ({ after }: { after?: string }) =>
    after ? { items: [beta] } : { items: [alpha], nextCursor: "next" },
  );
  renderInRouter(<Harness />, {
    client: stubClient({ listReferenceTargets, resolveReferenceTargets }),
  });
  await screen.findByText("Alpha");
  expect(resolveReferenceTargets).toHaveBeenCalledExactlyOnceWith(["a"], expect.any(AbortSignal));
  await user.click(await screen.findByRole("button", { name: "Add Reviews item" }));
  const picker = within(screen.getByRole("dialog"));
  await user.click(await picker.findByRole("button", { name: /^Alpha/ }));
  await user.click(picker.getByRole("button", { name: "More entries" }));
  await user.click(await picker.findByRole("button", { name: /^Beta.*Draft only/ }));
  await user.click(picker.getByRole("button", { name: /^Alpha/ }));
  expect(picker.getByRole("button", { name: /^Beta/ })).toBeDisabled();
  expect(picker.getByText(/0 slots remaining/)).toBeVisible();
  await user.click(picker.getByRole("button", { name: "Add selected entries" }));
  expect(screen.getByTestId("values")).toHaveTextContent('["a","b","a"]');
  const menu = screen.getByRole("button", { name: "Actions for Reviews item 2" });
  menu.focus();
  await user.keyboard("{Enter}");
  const move = await screen.findByRole("menuitem", { name: "Move up Reviews item 2" });
  move.focus();
  await user.keyboard("{Enter}");
  await waitFor(() => expect(screen.getByTestId("values")).toHaveTextContent('["b","a","a"]'));
  await user.click(screen.getByRole("button", { name: "Actions for Reviews item 2" }));
  await user.click(await screen.findByRole("menuitem", { name: "Remove Reviews item 2" }));
  await waitFor(() => expect(screen.getByTestId("values")).toHaveTextContent('["b","a"]'));
});

test("cancels obsolete searches and staged choices without dirtying the draft", async () => {
  const user = userEvent.setup();
  let initialSignal: AbortSignal | undefined;
  const listReferenceTargets = vi.fn<ReturnType<typeof stubClient>["listReferenceTargets"]>(
    async ({ search }, signal) => {
      if (search === "") {
        initialSignal = signal;
        await new Promise<void>((resolve) =>
          signal?.addEventListener("abort", () => resolve(), { once: true }),
        );
        return { items: [alpha] };
      }
      return { items: [beta] };
    },
  );
  renderInRouter(<Harness links={Array<string>(197).fill("entry:elsewhere")} />, {
    client: stubClient({
      listReferenceTargets,
      resolveReferenceTargets: async () => ({ a: alpha }),
    }),
  });
  await user.click(await screen.findByRole("button", { name: "Add Reviews item" }));
  const picker = within(screen.getByRole("dialog"));
  expect(picker.getByText("1 slot remaining.")).toBeVisible();
  await waitFor(() => expect(initialSignal).toBeDefined());
  await user.type(picker.getByRole("searchbox"), "Bet");
  expect(initialSignal?.aborted).toBe(true);
  await user.click(await picker.findByRole("button", { name: /^Beta/ }));
  expect(picker.queryByRole("button", { name: /^Alpha/ })).toBeNull();
  expect(listReferenceTargets.mock.calls.map(([query]) => query.search)).toEqual(["", "Bet"]);
  await user.click(picker.getByRole("button", { name: "Cancel" }));
  expect(screen.getByTestId("values")).toHaveTextContent("[]");
  expect(screen.getByTestId("dirty")).toHaveTextContent("false");
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Add Reviews item" })).toHaveFocus(),
  );
});

test("a viewer can retry a failed batch and inspect the result without write controls", async () => {
  const user = userEvent.setup();
  const resolveReferenceTargets = vi
    .fn()
    .mockRejectedValueOnce(new Error("Temporary failure"))
    .mockResolvedValue({ a: alpha });
  renderInRouter(<Harness readOnly />, { client: stubClient({ resolveReferenceTargets }) });
  const retry = await screen.findByRole("button", { name: "Retry entry status" });
  expect(screen.queryByText(/Missing entry/)).toBeNull();
  await user.click(retry);
  expect(await screen.findByRole("group", { name: "Review" })).toHaveTextContent("Alpha");
  expect(screen.getByText("Published")).toBeVisible();
  expect(screen.queryByRole("button", { name: /Clear|Add|Review/ })).toBeNull();
});
