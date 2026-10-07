import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { SiteStatusCards } from "./index.js";

test("shows readiness, models, and active tokens with a refresh action", async () => {
  const onRefresh = vi.fn();
  render(
    <SiteStatusCards
      activeTokens={3}
      error={null}
      onRefresh={onRefresh}
      refreshing={false}
      status={{ configuredModels: 4, engineVersion: "0.1.0-alpha.4", ready: true }}
    />,
  );
  expect(screen.getByRole("group", { name: "API" })).toHaveTextContent("Ready");
  expect(screen.getByRole("group", { name: "CMS version" })).toHaveTextContent("0.1.0-alpha.4");
  expect(screen.getByRole("group", { name: "Content models" })).toHaveTextContent("4");
  expect(screen.getByRole("group", { name: "Active build tokens" })).toHaveTextContent("3");
  await userEvent.setup().click(screen.getByRole("button", { name: "Refresh status" }));
  expect(onRefresh).toHaveBeenCalledOnce();
});

test("marks cards busy while loading", () => {
  render(
    <SiteStatusCards
      activeTokens={undefined}
      error={null}
      onRefresh={() => undefined}
      refreshing
      status={undefined}
    />,
  );
  expect(screen.getByRole("group", { name: "API" })).toHaveAttribute("aria-busy", "true");
  expect(screen.getByRole("group", { name: "CMS version" })).toHaveAttribute("aria-busy", "true");
  expect(screen.getByRole("button", { name: "Refresh status" })).toBeDisabled();
});

test("unavailable version is never guessed and cached status is labelled stale", () => {
  const props = {
    activeTokens: 0,
    error: new Error("Unavailable"),
    onRefresh() {},
    refreshing: false,
  };
  const { rerender } = render(<SiteStatusCards {...props} status={undefined} />);
  expect(screen.getByRole("group", { name: "CMS version" })).toHaveTextContent("—");
  expect(screen.queryByText("0.0.0")).not.toBeInTheDocument();
  rerender(
    <SiteStatusCards
      {...props}
      status={{ configuredModels: 0, engineVersion: "1.2.3-alpha.7", ready: true }}
    />,
  );
  expect(screen.getByRole("group", { name: "CMS version" })).toHaveTextContent("1.2.3-alpha.7");
  expect(screen.getByRole("status")).toHaveTextContent("Status is stale");
  expect(screen.getByRole("button", { name: "Try again" })).toBeEnabled();
});
