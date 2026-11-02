import { expect, test } from "vitest";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { parseDoctorArguments, doctorReport, checkOrder } from "../dist/doctor-report.js";

const options = parseDoctorArguments(["--target", "node", "--stage", "setup", "--json"]);
test("doctor requires unique explicit selectors and does not change ordinary defaults", () => {
  expect(options).toEqual({ target: "node", stage: "setup", mode: "native", json: true });
  for (const args of [
    [],
    ["--target", "node"],
    ["--stage", "ready"],
    ["--target", "bad", "--stage", "setup"],
    ["--target", "node", "--stage", "setup", "--stage", "ready"],
    ["--target", "cloudflare-local", "--stage", "setup", "--mode", "native"],
    ["--target", "node", "--stage", "setup", "--check"],
  ])
    expect(() => parseDoctorArguments(args)).toThrow();
});
test("invalid doctor produces sanitized JSON without loading configuration or runtime probes", () => {
  const result = spawnSync(
    process.execPath,
    [resolve(import.meta.dirname, "../dist/bin.js"), "doctor", "secret-sentinel", "--json"],
    {
      cwd: tmpdir(),
      encoding: "utf8",
      env: { ...process.env, LACE_DATABASE_PATH: "secret-sentinel" },
    },
  );
  expect(result.error).toBeUndefined();
  expect(result.status).toBe(3);
  expect(result.stderr).toBe("");
  expect(JSON.parse(result.stdout)).toMatchObject({ code: "USAGE", operation: "doctor" });
  expect(result.stdout).not.toContain("secret-sentinel");
});
test("report order and exit precedence are stable with expected states and dependent skips", () => {
  const item = (kind) => ({
    kind,
    code: "CHECK",
    reason: "Safe reason.",
    nextAction: "Safe recovery.",
  });
  const observations = new Map([
    ["api-readiness", item("operation")],
    ["migrations", item("unfinished")],
    ["settings", item("config")],
  ]);
  const result = doctorReport(options, observations);
  expect(result.exitCode).toBe(4);
  expect(result.report.data.checks.map((c) => c.id)).toEqual(checkOrder);
  expect(doctorReport(options, new Map([...observations].reverse())).output).toBe(result.output);
  observations.delete("settings");
  expect(doctorReport(options, observations).exitCode).toBe(6);
  expect(doctorReport({ ...options, stage: "ready" }, observations).exitCode).toBe(5);
  observations.delete("api-readiness");
  expect(doctorReport(options, observations).exitCode).toBe(0);
  expect(
    doctorReport(options, observations).report.data.checks.find((c) => c.id === "migrations")
      .status,
  ).toBe("expected");
});
