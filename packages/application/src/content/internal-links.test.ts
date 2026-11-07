// @ts-nocheck
// TODO(rf2): Type receipt graph fixtures, branded actors and deliberately tampered target guards.
import { expect, test } from "vitest";

test("link receipts bind actor, target, action, target guards and the graph without granting permissions", async () => {
  const {
    ContentLinkUseCases,
    encodeLinkImpactReceipt,
    decodeLinkImpactReceipt,
    assertLinkImpactAcknowledgment,
  } = await import("../index.js");
  const evidence = {
    version: 1,
    targetId: "target/日本語",
    action: "unpublish",
    actorId: "admin",
    draftRevision: 3,
    publishedSnapshotId: "published",
    graphRevision: 9,
  };
  const receipt = encodeLinkImpactReceipt(evidence);
  expect(decodeLinkImpactReceipt(receipt)).toEqual(evidence);
  const acknowledgment = { receipt, acknowledgePublishedLinks: true };
  expect(() => assertLinkImpactAcknowledgment(acknowledgment, evidence, true)).not.toThrow();
  expect(() => assertLinkImpactAcknowledgment(undefined, evidence, false)).not.toThrow();
  expect(() => assertLinkImpactAcknowledgment(undefined, evidence, true)).toThrow(
    expect.objectContaining({ code: "CONTENT_LINKS_IN_USE" }),
  );
  for (const change of [
    { targetId: "other" },
    { actorId: "other" },
    { action: "delete" },
    { draftRevision: 4 },
    { publishedSnapshotId: null },
    { graphRevision: 10 },
  ]) {
    expect(() =>
      assertLinkImpactAcknowledgment(acknowledgment, { ...evidence, ...change }, true),
    ).toThrow(expect.objectContaining({ code: "CONTENT_LINK_IMPACT_CHANGED" }));
  }
  for (const bad of ["", receipt + "=", receipt + "!", "x".repeat(4097)])
    expect(() => decodeLinkImpactReceipt(bad)).toThrow(
      expect.objectContaining({ code: "CONTENT_LINK_IMPACT_CHANGED" }),
    );
  const calls = [];
  const useCases = new ContentLinkUseCases({
    resolveLinkTargets: async (ids) => {
      calls.push(ids);
      return {};
    },
    listLinkTargets: async (query) => {
      calls.push(query);
      return { items: [] };
    },
    readLinkImpact: async (query) => {
      calls.push(query);
      return { mode: "sources", sources: [], receipt, hasPublishedUsages: false };
    },
  });
  let authorizationChecks = 0;
  const viewer = {
    id: "viewer",
    get role() {
      authorizationChecks++;
      return "viewer";
    },
  };
  await useCases.resolve(
    viewer,
    Array.from({ length: 200 }, (_, i) => `target-${i}`),
  );
  await useCases.list(viewer, { search: "  Studio  ", limit: 20 });
  await useCases.impact(viewer, { targetId: "target", action: "delete", limit: 20 });
  expect(authorizationChecks).toBe(3);
  expect(calls[1].search).toBe("Studio");
  expect(calls[2].actorId).toBe("viewer");
  for (const ids of [["same", "same"], [""], Array.from({ length: 201 }, (_, i) => `${i}`)])
    expect(() => useCases.resolve(viewer, ids)).toThrow();
  expect(() =>
    useCases.impact(viewer, {
      targetId: "target",
      action: "delete",
      limit: 20,
      sourceEntryId: "source",
      snapshotId: "snapshot",
      after: "mixed",
    }),
  ).toThrow();
  expect(calls).toHaveLength(3);
});
