import { afterEach, expect, test, vi } from "vitest";
import { fixture, uploadImage } from "../test-support/app-harness.js";
import { revision } from "./request.js";

// Header parsers raise ContractValidationError; any other failure inside the same
// wrapper is unexpected and must reach the classifier unchanged.
const parsers = vi.hoisted(() => ({ failure: undefined as Error | undefined }));
vi.mock("@lacecms/contracts", async (original) => {
  const actual = await original<typeof import("@lacecms/contracts")>();
  const failing =
    <Parse extends (...args: never[]) => unknown>(parse: Parse) =>
    (...args: Parameters<Parse>): ReturnType<Parse> => {
      if (parsers.failure !== undefined) throw parsers.failure;
      return parse(...args) as ReturnType<Parse>;
    };
  return {
    ...actual,
    resolveExpectedRevision: failing(actual.resolveExpectedRevision),
    resolveMediaPrecondition: failing(actual.resolveMediaPrecondition),
  };
});

afterEach(() => {
  parsers.failure = undefined;
});

test("the revision wrapper maps only contract failures to its validation message", () => {
  const request = new Request("https://lace.test/", { headers: { "if-match": 'W/"4"' } });
  expect(() => revision({}, request)).toThrow(
    expect.objectContaining({
      name: "ContractValidationError",
      issues: [
        expect.objectContaining({
          message: "expectedRevision and If-Match must supply one matching revision.",
          path: "",
        }),
      ],
    }),
  );
  const unexpected = new Error("private failure");
  parsers.failure = unexpected;
  expect(() => revision({ expectedRevision: 1 }, request)).toThrow(unexpected);
});

test("an unexpected failure while reading the media precondition is a server error", async () => {
  const { app } = await fixture({ maxBodyBytes: 8192 });
  const media = (await uploadImage(app, "cover.png")) as { readonly id: string };
  const patch = () =>
    app.fetch(
      new Request(`https://lace.test/api/v1/admin/media/${media.id}`, {
        body: JSON.stringify({ alt: "Cover" }),
        headers: { "content-type": "application/json", "if-match": 'W/"1"' },
        method: "PATCH",
      }),
    );
  const refused = await patch();
  expect(refused.status).toBe(422);
  expect(await refused.json()).toMatchObject({
    error: {
      code: "VALIDATION_FAILED",
      details: {
        issues: [{ message: "If-Match must carry the media item's current strong ETag." }],
      },
    },
  });
  parsers.failure = new Error("private failure");
  const failed = await patch();
  expect(failed.status).toBe(500);
  expect(await failed.json()).toEqual({
    error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred." },
  });
});
