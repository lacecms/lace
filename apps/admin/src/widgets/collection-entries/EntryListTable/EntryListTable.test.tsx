import { screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { entry, renderInRouter } from "../../../app/testing/index.js";
import { EntryListTable } from "./index.js";

const listColumns = [
  { field: { required: false, type: "number" as const }, key: "views", label: "Views" },
];
const row = { ...entry, listValues: { views: 1200 }, slug: "first-post" };

test("manual sorting reports the next API sort and marks busy rows", async () => {
  const user = userEvent.setup();
  const onSortChange = vi.fn();
  renderInRouter(
    <EntryListTable
      busy
      canManage={false}
      items={[row]}
      label="Posts"
      listColumns={listColumns}
      modelKey="posts"
      onSortChange={onSortChange}
      sort="-publishedAt"
    />,
  );

  const table = await screen.findByRole("table", { name: "Posts entries" });
  expect(table).toHaveAttribute("aria-busy", "true");
  expect(within(table).getByText("1,200")).toBeInTheDocument();
  expect(within(table).getByText("first-post")).toBeInTheDocument();
  expect(within(table).queryByRole("columnheader", { name: "Actions" })).not.toBeInTheDocument();
  expect(within(table).getByRole("columnheader", { name: "Views" })).not.toHaveAttribute(
    "aria-sort",
  );

  const published = within(table).getByRole("columnheader", { name: "Published" });
  expect(published).toHaveAttribute("aria-sort", "descending");
  await user.click(within(published).getByRole("button", { name: "Published" }));
  expect(onSortChange).toHaveBeenLastCalledWith("publishedAt");
  await user.click(within(table).getByRole("button", { name: "Updated" }));
  expect(onSortChange).toHaveBeenLastCalledWith("-updatedAt");
  await user.click(within(table).getByRole("button", { name: "Title" }));
  expect(onSortChange).toHaveBeenLastCalledWith("title");
});

test("configured headers namespace system collisions and expose sort direction", async () => {
  const user = userEvent.setup();
  const onSortChange = vi.fn();
  renderInRouter(
    <EntryListTable
      canManage={false}
      items={[row]}
      label="Posts"
      listColumns={[
        {
          field: { type: "text", required: false },
          key: "title",
          label: "Custom title",
          sortable: true,
        },
      ]}
      modelKey="posts"
      onSortChange={onSortChange}
      sort="-field:title"
    />,
  );
  const header = await screen.findByRole("columnheader", { name: "Custom title" });
  expect(header).toHaveAttribute("aria-sort", "descending");
  await user.click(within(header).getByRole("button", { name: "Custom title" }));
  expect(onSortChange).toHaveBeenLastCalledWith("field:title");
  expect(screen.getByRole("columnheader", { name: "Title" })).toHaveAttribute("aria-sort", "none");
});
