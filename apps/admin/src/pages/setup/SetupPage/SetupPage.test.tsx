import { screen, waitFor } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { renderRoute, stubClient, staticSessionSource } from "../../../app/testing/index.js";

test.each(["/", "/content/posts/entry-123", "/does-not-exist", "/setup"])(
  "incomplete anonymous entry %s reaches setup without protected requests",
  async (path) => {
    const listModels = vi.fn();
    const router = renderRoute(
      path,
      staticSessionSource(null),
      stubClient({ listModels, loadSetupState: async () => ({ setupComplete: false }) }),
    );
    expect(
      await screen.findByRole("heading", { name: "Create your administrator" }),
    ).toBeInTheDocument();
    expect(listModels).not.toHaveBeenCalled();
    expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/setup");
  },
);

test("completed setup closes a direct setup visit with a safe return path", async () => {
  const router = renderRoute("/setup?redirect=/content/posts", staticSessionSource(null));
  expect(await screen.findByRole("heading", { name: "Sign in" })).toBeInTheDocument();
  await waitFor(() => expect(router.state.location.search.redirect).toBe("/content/posts"));
});

test("authenticated setup visits use the existing session without reading public state", async () => {
  const loadSetupState = vi.fn();
  renderRoute(
    "/setup",
    staticSessionSource({ id: "admin", role: "admin" }),
    stubClient({ loadSetupState }),
  );
  expect(await screen.findByRole("heading", { name: "Content" })).toBeInTheDocument();
  expect(loadSetupState).not.toHaveBeenCalled();
});
