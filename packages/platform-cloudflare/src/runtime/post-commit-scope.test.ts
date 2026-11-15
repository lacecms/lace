import { expect, test } from "vitest";
import { markOutboxWork, run } from "./post-commit-scope.js";

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 1));

test("a mark outside a request scope does nothing", async () => {
  let calls = 0;
  markOutboxWork();
  await run(
    () => void (calls += 1),
    async () => undefined,
  );
  markOutboxWork();
  expect(calls).toBe(0);
});

test("several marks in one scope register work once", async () => {
  let calls = 0;
  await run(
    () => void (calls += 1),
    async () => {
      markOutboxWork();
      await tick();
      markOutboxWork();
    },
  );
  expect(calls).toBe(1);
});

test("concurrent request scopes are attributed separately across awaits", async () => {
  const registered: string[] = [];
  await Promise.all([
    run(
      () => void registered.push("writer"),
      async () => {
        await tick();
        markOutboxWork();
        await tick();
      },
    ),
    run(
      () => void registered.push("reader"),
      async () => {
        await tick();
        await tick();
        await tick();
      },
    ),
  ]);
  expect(registered).toEqual(["writer"]);
});
