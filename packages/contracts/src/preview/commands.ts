import { pagePathFailure } from "@lacecms/content";
import { isPreviewArtifactPath, previewFailureReasons, previewStates } from "@lacecms/domain";
import * as v from "valibot";
import { ParsedUrl } from "../shared/url.js";
import {
  expectedRevisionSchema,
  idempotencyKeySchema,
  isoTimestampSchema,
  mediaSha256Schema,
} from "../shared/primitives.js";

const revision = v.pipe(expectedRevisionSchema, v.minValue(1), v.maxValue(Number.MAX_SAFE_INTEGER));
export const previewGenerationIdSchema = v.pipe(
  v.string(),
  v.regex(/^[A-Za-z0-9_-]{1,128}(?![\s\S])/u),
);
export const previewLogicalPathSchema = v.pipe(
  v.string(),
  v.check((path) => !pagePathFailure(path), "Expected a canonical site route."),
);
export const previewArtifactPathSchema = v.pipe(v.string(), v.check(isPreviewArtifactPath));
export const previewSourceCommitSchema = v.pipe(
  v.string(),
  v.regex(/^(?:[0-9a-f]{40}|[0-9a-f]{64})(?![\s\S])/u),
);
export const createPreviewRequestSchema = v.strictObject({
  expectedRevision: revision,
  idempotencyKey: idempotencyKeySchema,
});

/** Transport authentication is separate from these bodies. */
export const previewBuilderRequestSchema = v.strictObject({
  generationId: previewGenerationIdSchema,
  reservationId: previewGenerationIdSchema,
});
export const previewClaimRequestSchema = v.strictObject({
  runId: previewGenerationIdSchema,
  commit: previewSourceCommitSchema,
});
export const previewFailureReasonSchema = v.picklist(previewFailureReasons);
export const previewObjectSchema = v.strictObject({
  sha256: mediaSha256Schema,
  bytes: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(1024 * 1024)),
});
export const previewCompletionRequestSchema = v.variant("outcome", [
  v.strictObject({ outcome: v.literal("ready"), manifest: previewObjectSchema }),
  v.strictObject({ outcome: v.literal("failed"), reason: previewFailureReasonSchema }),
]);
export const previewStatusSchema = v.nullable(
  v.strictObject({
    id: previewGenerationIdSchema,
    revision,
    state: v.picklist(previewStates),
    createdAt: isoTimestampSchema,
    readyAt: v.optional(isoTimestampSchema),
    expiresAt: v.optional(isoTimestampSchema),
    reason: v.optional(previewFailureReasonSchema),
  }),
);
export type PreviewStatusDto = v.InferOutput<typeof previewStatusSchema>;

const previewOrigin = v.pipe(
  v.string(),
  v.check((value) => {
    try {
      const url = new ParsedUrl(value);
      return (
        url.protocol === "https:" && !url.username && !url.password && url.href === `${value}/`
      );
    } catch {
      return false;
    }
  }, "Expected a canonical HTTPS origin."),
);

export const previewReadinessSchema = v.variant("ready", [
  v.strictObject({
    ready: v.literal(false),
    missing: v.optional(v.array(v.picklist(["preview-disabled", "preview-configuration"]))),
  }),
  v.strictObject({
    ready: v.literal(true),
    origin: previewOrigin,
    viewMode: v.picklist(["iframe", "new-tab"]),
  }),
]);

export const previewFrameMessageType = "lace-preview-frame";
export const previewFrameMessageSchema = v.strictObject({
  type: v.literal(previewFrameMessageType),
  generationId: previewGenerationIdSchema,
  status: v.picklist(["ready", "sign-in", "unavailable"]),
});
export type PreviewFrameStatus = v.InferOutput<typeof previewFrameMessageSchema>["status"];

export const previewReceiptSchema = v.strictObject({ id: previewGenerationIdSchema, revision });
export type PreviewReadinessDto = v.InferOutput<typeof previewReadinessSchema>;
export type PreviewReceiptDto = v.InferOutput<typeof previewReceiptSchema>;
