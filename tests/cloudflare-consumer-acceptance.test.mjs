import { expect, test } from "vitest";
import {
  excludedFromProjectScan,
  hookResponse,
  pagesDeploymentResponse,
  pagesTracking,
  providerDeploymentId,
  transientWranglerFile,
  withVariable,
  workerCommand,
} from "../scripts/cloudflare-consumer-acceptance.mjs";

test("controlled hook answers as an unavailable or accepting provider", () => {
  const unavailable = hookResponse("unavailable");
  expect(unavailable.status).toBe(503);
  const accepted = hookResponse("accepted");
  expect(accepted.status).toBe(200);
  expect(JSON.parse(accepted.body)).toMatchObject({
    success: true,
    result: { id: providerDeploymentId },
  });
});

test("controlled hook can accept a specific tracked deployment ID", () => {
  expect(JSON.parse(hookResponse("accepted", "tracked-1").body).result.id).toBe("tracked-1");
});

test("Pages API stub answers only the configured account, project and known deployments", () => {
  const deployments = new Map([["tracked-1", { name: "deploy", status: "success" }]]);
  const path = (id) =>
    `/client/v4/accounts/${pagesTracking.accountId}/pages/projects/${pagesTracking.projectName}/deployments/${id}`;
  const found = pagesDeploymentResponse(deployments, path("tracked-1"));
  expect(found.status).toBe(200);
  expect(JSON.parse(found.body)).toMatchObject({
    success: true,
    result: {
      id: "tracked-1",
      is_skipped: false,
      latest_stage: { name: "deploy", status: "success" },
    },
  });
  expect(pagesDeploymentResponse(deployments, path("other")).status).toBe(404);
  expect(
    pagesDeploymentResponse(deployments, path("tracked-1").replace(pagesTracking.projectName, "x"))
      .status,
  ).toBe(404);
  expect(pagesTracking.accountId).toMatch(/^[0-9a-f]{32}$/u);
});

test("only vanished Wrangler temporary bundles are skipped by the project scan", () => {
  const missing = Object.assign(new Error("gone"), { code: "ENOENT" });
  expect(transientWranglerFile("worker/.wrangler/tmp/dev-x/index.js.map", missing)).toBe(true);
  expect(transientWranglerFile("worker/index.ts", missing)).toBe(false);
  expect(
    transientWranglerFile(
      "worker/.wrangler/tmp/dev-x/index.js",
      Object.assign(new Error(), { code: "EACCES" }),
    ),
  ).toBe(false);
});

test("project secret scan skips only local secrets, state, dependencies and scanned output", () => {
  for (const path of [
    ".env",
    "worker/.dev.vars",
    "node_modules",
    "site/node_modules",
    ".lace/data",
    ".lace/acceptance-packages",
    "site/dist",
  ])
    expect(excludedFromProjectScan(path)).toBe(true);
  for (const path of [
    ".env.example",
    "worker/.dev.vars.example",
    "worker/wrangler.jsonc",
    ".lace/manifest.json",
    "site/src",
    "README.md",
  ])
    expect(excludedFromProjectScan(path)).toBe(false);
});

test("generated cf:dev command keeps its shape with only the port replaced", () => {
  expect(
    workerCommand("wrangler dev --config worker/wrangler.jsonc --local --port 8787", 9100),
  ).toEqual(["dev", "--config", "worker/wrangler.jsonc", "--local", "--port", "9100"]);
  expect(() => workerCommand("wrangler deploy --port 8787", 1)).toThrow("unexpected shape");
});

test("dotenv rewrite replaces one existing assignment", () => {
  expect(withVariable("A=1\nB=2\n", "B", "3")).toBe("A=1\nB=3\n");
  expect(() => withVariable("A=1\n", "B", "3")).toThrow("B is missing");
});
