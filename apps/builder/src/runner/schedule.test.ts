import { expect, test } from "vitest";
import { BuilderSchedule } from "./schedule.js";

const first = { generationId: "first", reservationId: "reservation-first" };
const second = { generationId: "second", reservationId: "reservation-second" };
const pin = async () => "a".repeat(40);

test("a publication revokes a provisional preview and takes the next slot", async () => {
  const publication = Promise.withResolvers<void>();
  const schedule = new BuilderSchedule(async () => {
    await publication.promise;
    return { status: "succeeded" };
  });
  expect((await schedule.reserve(first, pin)).status).toBe("reserved");
  const published = schedule.build({ buildId: "publication", targetVersion: 2 });
  expect(
    schedule.dispatch(first, async () => {
      throw new Error("unexpected preview");
    }),
  ).toBe(false);
  expect((await schedule.reserve(second, pin)).status).toBe("busy");
  publication.resolve();
  await published;
  expect((await schedule.reserve(second, pin)).status).toBe("reserved");
});

test("publication waits for a running preview and blocks the next preview", async () => {
  const events: string[] = [];
  const finish = Promise.withResolvers<void>();
  const publication = Promise.withResolvers<void>();
  const schedule = new BuilderSchedule(async () => {
    events.push("publication");
    await publication.promise;
    return { status: "succeeded" };
  });
  await schedule.reserve(first, pin);
  expect(
    schedule.dispatch(first, async (_job, _commit, signal) => {
      events.push("preview");
      await finish.promise;
      expect(signal.aborted).toBe(false);
      events.push("preview-finished");
    }),
  ).toBe(true);
  const published = schedule.build({ buildId: "publication", targetVersion: 2 });
  expect((await schedule.reserve(second, pin)).status).toBe("busy");
  expect(events).toEqual(["preview"]);
  finish.resolve();
  publication.resolve();
  await published;
  expect(events).toEqual(["preview", "preview-finished", "publication"]);
});

test("stop retains physical capacity until descendant cleanup has returned", async () => {
  const stopped = Promise.withResolvers<void>();
  const reaped = Promise.withResolvers<void>();
  const schedule = new BuilderSchedule(async () => ({ status: "succeeded" }));
  await schedule.reserve(first, pin);
  const running = Promise.withResolvers<void>();
  schedule.dispatch(first, async (_job, _commit, signal) => {
    signal.addEventListener("abort", () => stopped.resolve(), { once: true });
    running.resolve();
    await reaped.promise;
  });
  await running.promise;
  const confirmation = schedule.stop(first);
  await stopped.promise;
  expect((await schedule.reserve(second, pin)).status).toBe("busy");
  reaped.resolve();
  await confirmation;
  expect((await schedule.reserve(second, pin)).status).toBe("reserved");
});
