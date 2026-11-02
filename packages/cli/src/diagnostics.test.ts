import { expect, test } from "vitest";
import { describeFailure, failureDiagnostic, identifyOperation } from "./diagnostics.js";
import { presentResult } from "./index.js";

test("failure fields are additive in JSON and readable in human mode; success is unchanged", () => {
  for (const code of [
    "SYNC_PENDING",
    "SYNC_BLOCKED",
    "UPGRADE_CONFLICTS",
    "UPGRADE_BUSY",
    "UPGRADE_RECOVERY_PENDING",
  ]) {
    const result = {
      ok: false,
      code,
      message: "Existing report",
      data: { preserved: true },
      ...failureDiagnostic(code.startsWith("UPGRADE") ? "upgrade" : "content sync", code),
    };
    expect(JSON.parse(presentResult(result, true))).toEqual(result);
    expect(result.reason).not.toContain("unrecognized");
    const text = presentResult(result, false);
    for (const value of [result.operation, result.reason, result.nextAction])
      expect(text).toContain(value);
  }
  const success = {
    ok: true,
    code: "BOOTSTRAP_TOKEN",
    message: "intentional-token",
    data: { token: "intentional-token" },
  };
  expect(JSON.parse(presentResult(success, true))).toEqual(success);
  expect(presentResult(success, false)).toBe(success.message);
});

test("unknown exceptions and invalid arguments never enter diagnostics", () => {
  const sentinel = "password-secret-token";
  const failure = describeFailure(new Error(sentinel), "auth bootstrap");
  expect(failure).toMatchObject({
    code: "OPERATION_FAILED",
    exitCode: 6,
    operation: "auth bootstrap",
  });
  expect(JSON.stringify(failure)).not.toContain(sentinel);
  expect(identifyOperation([sentinel, "--json"])).toBe("cli");
  expect(identifyOperation(["--target", "node", "content", "sync", "--json"])).toBe("content sync");
});

test("wrapped driver errors use codes without echoing messages", () => {
  for (const [code, reason] of [
    ["SQLITE_BUSY", "locked"],
    ["SQLITE_READONLY", "read-only"],
    ["EPERM", "denied"],
  ]) {
    const error = new Error("private-password-token", {
      cause: Object.assign(new Error("private-path"), { code }),
    });
    const failure = describeFailure(error, "db migrate");
    expect(failure.reason).toContain(reason);
    expect(JSON.stringify(failure)).not.toContain("private-");
    expect(failure.exitCode).toBe(6);
  }
});
