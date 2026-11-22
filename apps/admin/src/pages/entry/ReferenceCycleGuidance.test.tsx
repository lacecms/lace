import { screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { renderInRouter, stubClient } from "../../app/testing/index.js";
import { ReferenceCycleGuidance } from "./ReferenceCycleGuidance.js";

test("a cycle without a publish-first correction explains both the edit and omitted witness entries", async () => {
  const target = {
    id: "a",
    modelKey: "posts",
    modelKind: "collection",
    title: "Alpha",
    state: "published",
  } as const;
  renderInRouter(<ReferenceCycleGuidance cycle={{ witness: ["a", "b", "a"], truncated: true }} />, {
    client: stubClient({
      resolveReferenceTargets: async () => ({
        a: target,
        b: { ...target, id: "b", title: "Beta" },
      }),
    }),
  });
  expect(await screen.findByText(/Alpha → Beta → … → Alpha/)).toHaveTextContent(
    "additional entries omitted",
  );
  expect(screen.getByText(/Replace or remove the highlighted selection/)).toBeVisible();
});
