import * as v from "valibot";
import { describe, expect, it } from "vitest";
import {
  createPreviewRequestSchema,
  previewArtifactPathSchema,
  previewBuilderRequestSchema,
  previewClaimRequestSchema,
  previewCompletionRequestSchema,
  previewLogicalPathSchema,
  previewStatusSchema,
} from "./commands.js";

describe("preview transport contracts", () => {
  const request = { expectedRevision: 7, idempotencyKey: "preview-7" };
  const builder = { generationId: "gen-1", reservationId: "reservation-1" };
  const claim = { runId: "run-1", commit: "a".repeat(40) };

  it("accepts only the saved revision and key from the editor", () => {
    expect(v.parse(createPreviewRequestSchema, request)).toEqual(request);
    for (const expectedRevision of [-1, 0, 0.5, Infinity, Number.MAX_SAFE_INTEGER + 1, "7"]) {
      expect(v.is(createPreviewRequestSchema, { ...request, expectedRevision })).toBe(false);
    }
    for (const key of ["command", "path", "ref", "environment", "credentials"]) {
      expect(v.is(createPreviewRequestSchema, { ...request, [key]: "override" })).toBe(false);
    }
  });

  it("admits opaque runner identifiers and pinned commits without command overrides", () => {
    expect(v.is(previewBuilderRequestSchema, builder)).toBe(true);
    expect(v.is(previewClaimRequestSchema, claim)).toBe(true);
    expect(v.is(previewBuilderRequestSchema, { ...builder, generationId: "../other" })).toBe(false);
    expect(v.is(previewClaimRequestSchema, { ...claim, commit: "refs/heads/main" })).toBe(false);
    for (const field of ["command", "path", "sourceRef", "environment", "token"]) {
      expect(v.is(previewBuilderRequestSchema, { ...builder, [field]: "override" })).toBe(false);
      expect(v.is(previewClaimRequestSchema, { ...claim, [field]: "override" })).toBe(false);
    }
  });

  it("distinguishes canonical site routes from private relative resource paths", () => {
    expect(v.is(previewLogicalPathSchema, "/")).toBe(true);
    expect(v.is(previewLogicalPathSchema, "/posts/example")).toBe(true);
    expect(v.is(previewArtifactPathSchema, "_astro/site.a123.css")).toBe(true);
    for (const input of [
      "../private",
      "a/../private",
      "a%2fb",
      "a%5cb",
      "a\\b",
      ".env",
      ".git/config",
      "//host/x",
      "a.js.map",
      "a?token=x",
    ]) {
      expect(v.is(previewArtifactPathSchema, input)).toBe(false);
    }
    expect(v.is(previewLogicalPathSchema, "//other.test/path")).toBe(false);
  });

  it("rejects raw errors and internal data in status and completion responses", () => {
    const status = {
      id: "gen-1",
      revision: 7,
      state: "failed",
      createdAt: "2026-11-17T00:00:00.000Z",
      reason: "PREVIEW_STORAGE_FAILED",
    };
    expect(v.is(previewStatusSchema, status)).toBe(true);
    expect(v.is(previewStatusSchema, { ...status, runId: "private-run" })).toBe(false);
    expect(v.is(previewStatusSchema, { ...status, reason: "raw provider error" })).toBe(false);
    expect(v.is(previewCompletionRequestSchema, { outcome: "failed", reason: status.reason })).toBe(
      true,
    );
    expect(v.is(previewCompletionRequestSchema, { outcome: "failed", reason: "raw error" })).toBe(
      false,
    );
    expect(
      v.is(previewCompletionRequestSchema, {
        outcome: "ready",
        manifest: { sha256: "a".repeat(64), bytes: 9, key: "internal/object" },
      }),
    ).toBe(false);
  });
});
