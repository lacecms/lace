import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { fingerprint, yamlDocuments, lockClosure } from "../scripts/docs-inputs.mjs";
import { decide, successfulBaseline } from "../scripts/docs-publication.mjs";
const require = createRequire(new URL("../apps/docs/package.json", import.meta.url));
const { stringify } = require("yaml");
const list = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], {
  encoding: "utf8",
})
  .trim()
  .split("\n");
const read = (path) => readFileSync(path, "utf8");
const source = Object.fromEntries(
  [
    "pnpm-lock.yaml",
    "pnpm-workspace.yaml",
    "package.json",
    "turbo.json",
    ...list.filter(
      (p) =>
        p.startsWith("apps/docs/") ||
        p.startsWith("scripts/docs-") ||
        p === ".github/workflows/docs-pages.yml" ||
        p === "apps/api/openapi/api-v1.json" ||
        p === ".oxlintrc.json" ||
        p === ".oxfmtrc.json",
    ),
  ].map((p) => [p, read(p)]),
);
const digest = (changes = {}) => fingerprint((path) => ({ ...source, ...changes })[path], list);
const base = {
  candidate: "new",
  baseline: "old",
  force: false,
  ref: "refs/heads/main",
  event: "push",
  ancestor: (a, b) => a === "old" && b === "new",
  digest: (sha) => sha,
};
test("hashes public inputs and ignores internal-only prose", () => {
  const before = digest();
  expect(digest({ "README.md": "changed", "docs/mvp-architecture.md": "changed" })).toBe(before);
  expect(digest({ "apps/docs/src/catalog.json": "changed" })).not.toBe(before);
  expect(digest({ "apps/api/openapi/api-v1.json": "changed" })).not.toBe(before);
  expect(digest({ ".github/workflows/docs-pages.yml": "changed" })).not.toBe(before);
});
test("projects only docs dependency closure, including transitive resolutions", () => {
  const documents = yamlDocuments(source["pnpm-lock.yaml"]);
  const lock = documents.find((doc) => doc.importers?.["apps/docs"]);
  const closure = lockClosure(lock);
  const unrelated = Object.keys(lock.packages).find((key) => !closure.packages[key]);
  lock.packages[unrelated].resolution = { integrity: "unrelated-change" };
  const changed = () => documents.map((doc) => stringify(doc)).join("\n---\n");
  expect(digest({ "pnpm-lock.yaml": changed() })).toBe(digest());
  lock.packages[Object.keys(closure.packages)[0]].resolution = { integrity: "relevant-change" };
  expect(digest({ "pnpm-lock.yaml": changed() })).not.toBe(digest());
  const key = Object.keys(closure.snapshots)[0];
  delete lock.snapshots[key];
  expect(() => lockClosure(lock)).toThrow("Unresolved");
});
test("unrelated catalog/root script changes do not deploy", () => {
  const workspace = yamlDocuments(source["pnpm-workspace.yaml"])[0];
  workspace.catalog["irrelevant-tool"] = "1.0.0";
  const pkg = JSON.parse(source["package.json"]);
  pkg.scripts["dev:node"] = "unrelated";
  expect(
    digest({ "pnpm-workspace.yaml": stringify(workspace), "package.json": JSON.stringify(pkg) }),
  ).toBe(digest());
});
test("first publication and failed-publication retry use durable successful baseline", () => {
  expect(decide({ ...base, baseline: null }).publish).toBe(true);
  expect(decide(base).publish).toBe(true); // failed attempt never supplied as successful baseline
  expect(decide({ ...base, digest: () => "same" }).publish).toBe(false);
  expect(decide({ ...base, digest: () => "same", force: true }).publish).toBe(true);
});
test("rejects untrusted refs, stale reruns and divergent ancestry", () => {
  expect(decide({ ...base, ref: "refs/heads/feature", force: true }).publish).toBe(false);
  expect(decide({ ...base, event: "pull_request" }).publish).toBe(false);
  expect(decide({ ...base, ancestor: () => true, force: true }).reason).toBe("stale-revision");
  expect(() => decide({ ...base, ancestor: () => false })).toThrow("Divergent");
});
test("history read failures are not absence", async () => {
  await expect(
    successfulBaseline(async () => {
      throw new Error("403");
    }, "owner/repo"),
  ).rejects.toThrow("403");
  expect(await successfulBaseline(async () => [], "owner/repo")).toBe(null);
});
test("paginates past failures and checks successful workflow identity", async () => {
  const sha = "a".repeat(40);
  const calls = [];
  const request = async (path) => {
    calls.push(path);
    if (path.endsWith("page=1")) return Array.from({ length: 100 }, (_, id) => ({ id, sha }));
    if (path.endsWith("page=2")) return [{ id: 101, sha }];
    if (path.includes("/101/statuses"))
      return [
        { state: "inactive" },
        { state: "success", log_url: "https://github.com/owner/repo/actions/runs/88/job/99" },
      ];
    if (path.includes("/statuses")) return [{ state: "failure" }];
    return {
      path: ".github/workflows/docs-pages.yml",
      head_branch: "main",
      head_repository: { full_name: "owner/repo" },
      head_sha: sha,
    };
  };
  expect(await successfulBaseline(request, "owner/repo")).toBe(sha);
  expect(calls.some((path) => path.endsWith("page=2"))).toBe(true);
});
test("publication workflow has one serialization boundary and no PR write path", () => {
  const workflow = yamlDocuments(read(".github/workflows/docs-pages.yml"))[0];
  expect(workflow.on.pull_request).toBeUndefined();
  expect(workflow.concurrency["cancel-in-progress"]).toBe(false);
  expect(workflow.jobs.build.if).toContain("refs/heads/main");
  expect(workflow.jobs.build.permissions["pages"]).toBeUndefined();
  expect(workflow.jobs.deploy.needs).toBe("build");
  expect(workflow.jobs.deploy.if).toContain("publish == 'true'");
  expect(workflow.jobs.deploy.permissions["id-token"]).toBe("write");
  const ci = yamlDocuments(read(".github/workflows/ci.yml"))[0];
  expect(ci.on.pull_request ?? {}).not.toHaveProperty("paths");
  expect(ci.jobs.quality.steps.some((step) => step.run?.includes("pnpm docs:check"))).toBe(true);
});
