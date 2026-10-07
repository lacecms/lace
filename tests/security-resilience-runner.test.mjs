import { expect, test } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  executeRequiredPhases,
  ownedCommand,
} from "../scripts/security-resilience-verification.mjs";
import { validateAudit } from "../scripts/dependency-audit.mjs";

test("34B required phases reject empty and unavailable definitions, preserving not-run successors", async () => {
  await expect(
    executeRequiredPhases(
      [],
      async () => {},
      async () => {},
    ),
  ).rejects.toThrow("empty");
  const snapshots = [];
  await expect(
    executeRequiredPhases(
      [{ name: "missing" }, { name: "next", command: "node", args: [] }],
      async () => {},
      async (value) => snapshots.push(structuredClone(value)),
    ),
  ).rejects.toThrow("unavailable");
  expect(snapshots.at(-1).phases).toEqual([
    { name: "missing", status: "failed" },
    { name: "next", status: "not-run" },
  ]);
});
for (const kind of ["missing", "empty", "skipped", "failed"])
  test(`34B ${kind} test phase cannot pass`, async () => {
    const root = await mkdtemp(join(tmpdir(), "lace-34b-runner-"));
    try {
      const path = join(root, "suite.json");
      if (kind !== "missing")
        await writeFile(
          path,
          JSON.stringify({
            success: kind !== "failed",
            numTotalTests: kind === "empty" ? 0 : 1,
            numPassedTests: kind === "empty" || kind === "skipped" ? 0 : 1,
            numFailedTests: kind === "failed" ? 1 : 0,
            numPendingTests: kind === "skipped" ? 1 : 0,
          }),
        );
      let final;
      await expect(
        executeRequiredPhases(
          [
            { name: "tests", command: "node", args: [], testReport: path },
            { name: "later", command: "node", args: [] },
          ],
          async () => {},
          async (report) => {
            final = structuredClone(report);
          },
        ),
      ).rejects.toThrow();
      expect(final.complete).toBe(false);
      expect(final.phases.map((phase) => phase.status)).toEqual(["failed", "not-run"]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
test("34B interrupted owned command waits for child cleanup and marks successors not-run", async () => {
  const root = await mkdtemp(join(tmpdir(), "lace-34b-interruption-"));
  try {
    const ready = join(root, "ready"),
      cleaned = join(root, "cleaned");
    const script = join(root, "child.mjs");
    await writeFile(
      script,
      `import {writeFileSync} from 'node:fs'; process.once('SIGTERM', () => {writeFileSync(${JSON.stringify(cleaned)}, 'cleaned'); process.exit(0);}); writeFileSync(${JSON.stringify(ready)}, 'ready'); setInterval(() => {}, 1000);`,
    );
    const controller = new AbortController();
    let final;
    const running = executeRequiredPhases(
      [
        { name: "owned", command: process.execPath, args: [script] },
        { name: "later", command: "node", args: [] },
      ],
      (phase) => ownedCommand(phase.command, phase.args, { signal: controller.signal }),
      async (report) => {
        final = structuredClone(report);
      },
    );
    // Readiness is durable: do not signal before the child installs its cleanup handler.
    for (let attempt = 0; ; attempt++) {
      try {
        await readFile(ready);
        break;
      } catch {
        if (attempt > 100) throw new Error("child readiness missing");
        await new Promise((done) => setTimeout(done, 10));
      }
    }
    controller.abort();
    await expect(running).rejects.toThrow("interrupted");
    expect(await readFile(cleaned, "utf8")).toBe("cleaned");
    expect(final.phases.map((phase) => phase.status)).toEqual(["failed", "not-run"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test("34B audit rejects undispositioned advisories and unknown/missing license data", () => {
  const base = { metadata: {}, advisories: {} };
  expect(() => validateAudit(base, [{ license: "MIT" }])).not.toThrow();
  expect(() =>
    validateAudit(
      { ...base, advisories: { one: { url: "https://example.test/new", module_name: "new" } } },
      [{ license: "MIT" }],
    ),
  ).toThrow("undispositioned");
  for (const licenses of [[], [{}], [{ license: "unknown" }]])
    expect(() => validateAudit(base, licenses)).toThrow();
});
