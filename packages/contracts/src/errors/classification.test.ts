// @ts-nocheck
// TODO(rf2): Type mutable transport fixtures and deliberately malformed metadata.
import { DomainError, BlockOrderError } from "@lacecms/domain";
import * as v from "valibot";
import { describe, expect, test } from "vitest";
import { classifyError, transportError } from "./classification.js";
import { errorEnvelopeSchema, validationError } from "./envelope.js";

describe("account lifecycle contracts", () => {
  const ok = (schema, value) => v.safeParse(schema, value).success;
  test("account error codes map to their documented statuses", () => {
    for (const [code, status] of [
      ["CONFLICT", 409],
      ["INVALID_CREDENTIALS", 400],
      ["INVITATION_INVALID", 410],
      ["RESET_INVALID", 410],
    ]) {
      const error = transportError(code);
      expect(error.status).toBe(status);
      expect(ok(errorEnvelopeSchema, error.body)).toBe(true);
    }
  });
});

describe("shared REST transport conventions", () => {
  test("maps known errors and validation issues without exposing exception text", () => {
    const conflict = classifyError(new DomainError("CONTENT_REVISION_CONFLICT", "sql: secret"));
    expect(conflict).toEqual({
      body: {
        error: {
          code: "CONTENT_REVISION_CONFLICT",
          message: "The draft was modified by another request.",
        },
      },
      status: 409,
    });
    expect(classifyError(new DomainError("LAST_ADMIN_PROTECTED", "private detail"))).toEqual({
      body: {
        error: {
          code: "LAST_ADMIN_PROTECTED",
          message: "The final active administrator cannot be disabled or demoted.",
        },
      },
      status: 409,
    });
    expect(classifyError(new DomainError("CONTENT_NOT_PUBLISHED", "entry post-1"))).toEqual({
      body: { error: { code: "CONTENT_NOT_PUBLISHED", message: "The entry is not published." } },
      status: 409,
    });
    expect(classifyError(new DomainError("CONTENT_PAGE_SINGLETON", "page home"))).toEqual({
      body: {
        error: {
          code: "CONTENT_PAGE_SINGLETON",
          message: "Page and global entries are defined by configuration.",
        },
      },
      status: 409,
    });
    expect(classifyError(new DomainError("MEDIA_IN_USE", "entry post-1 uses media"))).toEqual({
      body: { error: { code: "MEDIA_IN_USE", message: "The media is still used by content." } },
      status: 409,
    });
    expect(JSON.stringify(classifyError(new Error("select * from secrets")))).not.toContain(
      "secrets",
    );
    expect(
      validationError([{ code: "invalid_type", message: "must be text", path: "/fields/title" }]),
    ).toEqual({
      body: {
        error: {
          code: "VALIDATION_FAILED",
          details: {
            issues: [{ code: "invalid_type", message: "must be text", path: "/fields/title" }],
          },
          message: "The request did not satisfy the API contract.",
        },
      },
      status: 422,
    });
  });
  test("renders stable sanitized HTTP boundary errors", () => {
    expect(transportError("NOT_FOUND")).toEqual({
      body: { error: { code: "NOT_FOUND", message: "The requested resource was not found." } },
      status: 404,
    });
    expect(transportError("RATE_LIMITED")).toEqual({
      body: { error: { code: "RATE_LIMITED", message: "Too many requests were received." } },
      status: 429,
    });
    expect(transportError("PAYLOAD_TOO_LARGE")).toEqual({
      body: { error: { code: "PAYLOAD_TOO_LARGE", message: "The request body is too large." } },
      status: 413,
    });
  });
});

test("transports only bounded block-order diagnostics and keeps other domain messages private", () => {
  const error = new BlockOrderError(1, "01ARZ3NDEKTSV4RRFFQ69G5FA1");
  expect(classifyError(error)).toEqual({
    status: 422,
    body: { error: { code: "CONTENT_INVALID_STATE", message: error.message } },
  });
  expect(
    classifyError(new DomainError("CONTENT_INVALID_STATE", "secret-content")).body.error.message,
  ).not.toContain("secret-content");
  expect(classifyError(new BlockOrderError(1, "password=secret")).body.error.message).not.toContain(
    "password",
  );
});

test("content and query errors share value-free stable codes and escaped pointers", async () => {
  const { classifyError } = await import("./classification.js");
  const { contractIssuePointer } = await import("./envelope.js");
  const { CollectionQueryValidationError } = await import("@lacecms/domain");
  const { ContentValidationError } = await import("@lacecms/content");
  const query = classifyError(new CollectionQueryValidationError("/filters/0/value"));
  expect(query).toMatchObject({
    status: 422,
    body: {
      error: { code: "VALIDATION_FAILED", details: { issues: [{ path: "/filters/0/value" }] } },
    },
  });
  expect(contractIssuePointer([{ key: "a/b~c" }, 0])).toBe("/a~1b~0c/0");
  const error = new ContentValidationError([
    { code: "invalid_value", message: "Invalid field.", path: ["fields", "title"] },
  ]);
  expect(classifyError(error)).toMatchObject({
    status: 422,
    body: { error: { code: "VALIDATION_FAILED" } },
  });
});
