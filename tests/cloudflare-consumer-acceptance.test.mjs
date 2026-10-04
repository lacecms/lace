import { expect, test } from "vitest";
import {
  excludedFromProjectScan,
  hookResponse,
  providerDeploymentId,
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
