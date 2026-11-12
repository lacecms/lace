import { expect, test, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { CONFIGURATION_SYNC_STALE, LaceError } from "@lacecms/contracts";
import { runCommand } from "./commands.js";
import { CliError, type CliOptions } from "../index.js";

const apply = vi.hoisted(() => ({ failure: undefined as Error | undefined }));
vi.mock("@lacecms/application", async (original) => {
  const actual = await original<typeof import("@lacecms/application")>();
  return {
    ...actual,
    applyPreparedConfigurationSynchronization: async () => {
      throw apply.failure;
    },
  };
});

const cwd = resolve(import.meta.dirname, "../../../..");
const option = (command: CliOptions["command"]): CliOptions => ({
  check: false,
  command,
  json: true,
  target: "node",
});

async function syncFailure(failure: Error): Promise<unknown> {
  const directory = await mkdtemp(join(tmpdir(), "lace-cli-sync-failure-"));
  const environment = { databasePath: join(directory, "lace.sqlite") };
  try {
    await runCommand(option("db migrate"), environment, cwd);
    apply.failure = failure;
    return await runCommand(option("content sync"), environment, cwd).then(
      () => undefined,
      (error: unknown) => error,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test("content sync recognizes a stale plan by its code, whatever its message", async () => {
  const error = await syncFailure(
    new LaceError(CONFIGURATION_SYNC_STALE, "Stored models changed."),
  );
  expect(error).toBeInstanceOf(CliError);
  expect(error).toMatchObject({ code: "OPERATION_FAILED" });
  expect((error as CliError).message).toContain("rerun `lace content sync`");
}, 30_000);

test("content sync reports an invalid-content failure that mentions staleness unchanged", async () => {
  const failure = new LaceError("CONTENT_INVALID_STATE", "A stale value is invalid.");
  expect(await syncFailure(failure)).toBe(failure);
}, 30_000);
