import type { PreviewGeneration } from "@lacecms/application";
import { contentEntryId, contentModelKey, unixMilliseconds } from "@lacecms/domain";
import { expect, test, vi } from "vitest";
import { GitHubPreview, githubPreviewExecutor } from "./preview-github.js";

const commit = "a".repeat(40);
const token = "private-github-token";
const generation: PreviewGeneration = {
  id: "generation-one",
  revision: 3,
  state: "preparing",
  createdAt: unixMilliseconds(100),
  entryId: contentEntryId("one"),
  modelKey: contentModelKey("page"),
  path: "/",
  source: { commit, executor: githubPreviewExecutor },
  configuration: "[]",
  publicVersion: 2,
  captureEpoch: 1,
  overallDeadline: unixMilliseconds(900_100),
};
const settings = {
  repository: "org/site",
  workflow: "lace-preview.yml",
  ref: "site/production",
  token,
};
const provider = {
  id: 123,
  path: ".github/workflows/lace-preview.yml@site/production",
  display_title: "Lace preview generation-one",
  head_sha: commit,
  status: "queued",
  event: "workflow_dispatch",
  run_attempt: 1,
};

test("preserves the Workerd receiver when using the default fetch", async () => {
  vi.stubGlobal("fetch", function (this: unknown) {
    expect(this).toBe(globalThis);
    return Promise.resolve(new Response(commit));
  });
  try {
    expect(await new GitHubPreview(settings).source()).toEqual(generation.source);
  } finally {
    vi.unstubAllGlobals();
  }
});

test("pins the operator ref, dispatches only the fixed workflow, and controls only that exact run", async () => {
  const request = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(new Response(commit))
    .mockResolvedValueOnce(
      Response.json({ workflow_run_id: 123, run_url: "https://other.invalid/" }),
    )
    .mockResolvedValueOnce(Response.json(provider))
    .mockResolvedValueOnce(Response.json(provider))
    .mockResolvedValueOnce(new Response(null, { status: 202 }))
    .mockResolvedValueOnce(
      Response.json({ ...provider, status: "completed", conclusion: "cancelled" }),
    );
  const github = new GitHubPreview(settings, request);
  expect(await github.source()).toEqual(generation.source);
  expect(new Headers(request.mock.calls[0]?.[1]?.headers).get("accept")).toBe(
    "application/vnd.github.sha",
  );
  expect(await github.dispatch(generation)).toBe("123");
  expect(await github.run(generation, "123")).toEqual({
    attempt: 1,
    completed: false,
    matchesSource: true,
  });
  expect(await github.cancel(generation, "123")).toBe("unconfirmed");
  expect(await github.cancel(generation, "123")).toBe("stopped");
  expect(request.mock.calls.map(([url]) => String(url))).toEqual([
    "https://api.github.com/repos/org/site/commits/site%2Fproduction",
    "https://api.github.com/repos/org/site/actions/workflows/lace-preview.yml/dispatches",
    "https://api.github.com/repos/org/site/actions/runs/123",
    "https://api.github.com/repos/org/site/actions/runs/123",
    "https://api.github.com/repos/org/site/actions/runs/123/cancel",
    "https://api.github.com/repos/org/site/actions/runs/123",
  ]);
  expect(JSON.parse(String(request.mock.calls[1]?.[1]?.body))).toEqual({
    ref: settings.ref,
    inputs: {
      generation: generation.id,
      commit,
    },
  });
  expect(request.mock.calls.every(([, options]) => options?.redirect === "manual")).toBe(true);
});

test("refuses GitHub redirects without fetching the location", async () => {
  const request = vi
    .fn<typeof fetch>()
    .mockResolvedValue(
      new Response(null, { status: 302, headers: { location: "https://other.invalid/" } }),
    );
  await expect(new GitHubPreview(settings, request).source()).rejects.toMatchObject({
    category: "provider",
  });
  expect(request).toHaveBeenCalledTimes(1);
});

test.each([
  { id: 321 },
  { path: ".github/workflows/publish.yml" },
  { event: "push" },
  { display_title: "Lace preview generation-two" },
])("rejects mismatched provider identity %j before cancellation", async (change) => {
  const request = vi
    .fn<typeof fetch>()
    .mockResolvedValue(Response.json({ ...provider, ...change }));
  await expect(
    new GitHubPreview(settings, request).cancel(generation, "123"),
  ).rejects.toMatchObject({ category: "correlation" });
  expect(request).toHaveBeenCalledTimes(1);
});

test("reports ref movement, reruns, revoked credentials and quota without raw provider content", async () => {
  const request = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(Response.json({ ...provider, head_sha: "b".repeat(40), run_attempt: 2 }))
    .mockResolvedValueOnce(new Response(token, { status: 401 }))
    .mockResolvedValueOnce(
      new Response(token, { status: 403, headers: { "x-ratelimit-remaining": "0" } }),
    );
  const github = new GitHubPreview(settings, request);
  expect(await github.run(generation, "123")).toMatchObject({ matchesSource: false, attempt: 2 });
  for (const [category, message] of [
    ["credentials", "PREVIEW_CONFIGURATION_UNAVAILABLE"],
    ["quota", "PREVIEW_PROVIDER_QUOTA"],
  ]) {
    await expect(github.dispatch(generation)).rejects.toMatchObject({
      category,
      message,
    });
  }
});
