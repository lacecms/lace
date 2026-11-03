import {
  siteBuildStatuses,
  siteBuildFailureReasons,
  siteBuildProviderStages,
  sourceFailureReasons,
  safeBuildSourcePath,
  normalizeBuildFailure,
  BUILD_SOURCE_PATH_PATTERN,
} from "@lacecms/domain";
import type { SiteBuildProviderStage, SiteBuildState, SiteBuildStatus } from "@lacecms/domain";
import * as v from "valibot";
import {
  identifierSchema,
  nonNegativeIntegerSchema,
  isoTimestampSchema,
  toIsoTimestamp,
} from "../shared/primitives.js";

export const buildRequestSchema = v.strictObject({});
export const buildQueueReceiptSchema = v.strictObject({
  coalesced: v.boolean(),
  eventId: identifierSchema,
  targetVersion: nonNegativeIntegerSchema,
});
export type BuildQueueReceiptDto = v.InferOutput<typeof buildQueueReceiptSchema>;
/** The closed site-build lifecycle; only `succeeded` proves publication. */
export const siteBuildStatusSchema = v.picklist(siteBuildStatuses);

export const siteBuildSchema = v.strictObject({
  id: identifierSchema,
  publishedSnapshotId: v.optional(identifierSchema),
  requestedAt: isoTimestampSchema,
  requestedBy: identifierSchema,
  status: siteBuildStatusSchema,
  targetVersion: nonNegativeIntegerSchema,
});

/** Persisted build history exposed to authenticated admin sessions. */
export const buildFailureReasonSchema = v.picklist(siteBuildFailureReasons);
export const buildSourcePathSchema = v.pipe(
  v.string(),
  v.minLength(1),
  v.maxLength(512),
  v.regex(BUILD_SOURCE_PATH_PATTERN),
  v.check((value) => safeBuildSourcePath(value) !== undefined),
  v.description(
    "Installation-relative ASCII entry path; excludes credentials, environment files, Git and CMS data. Present only with a source failure reason.",
  ),
);
/** Latest observed stage of a tracked provider deployment. */
export const siteBuildProviderStageSchema = v.picklist(siteBuildProviderStages);
export const siteBuildRecordSchema = v.pipe(
  v.strictObject({
    id: identifierSchema,
    reason: identifierSchema,
    status: siteBuildStatusSchema,
    targetVersion: nonNegativeIntegerSchema,
    requestedBy: identifierSchema,
    requestedAt: isoTimestampSchema,
    startedAt: v.optional(isoTimestampSchema),
    completedAt: v.optional(isoTimestampSchema),
    providerBuildId: v.optional(identifierSchema),
    providerStage: v.optional(siteBuildProviderStageSchema),
    providerCheckedAt: v.optional(isoTimestampSchema),
    error: v.optional(buildFailureReasonSchema),
    errorPath: v.optional(buildSourcePathSchema),
  }),
  v.check(
    (value) =>
      value.errorPath === undefined ||
      (value.error !== undefined && sourceFailureReasons.includes(value.error)),
    "Source path requires a source failure reason.",
  ),
);
export const siteBuildListSchema = v.strictObject({
  items: v.pipe(v.array(siteBuildRecordSchema), v.maxLength(100)),
});
export type SiteBuildRecordDto = v.InferOutput<typeof siteBuildRecordSchema>;
export type SiteBuildListDto = v.InferOutput<typeof siteBuildListSchema>;

export type SiteBuildDto = v.InferOutput<typeof siteBuildSchema>;
export function toSiteBuildDto(build: SiteBuildState): SiteBuildDto {
  return {
    id: build.id,
    ...(build.publishedSnapshotId === undefined
      ? {}
      : { publishedSnapshotId: build.publishedSnapshotId }),
    requestedAt: toIsoTimestamp(build.requestedAt),
    requestedBy: build.requestedBy,
    status: build.status,
    targetVersion: build.targetVersion,
  };
}

export function toSiteBuildRecordDto(build: {
  readonly id: string;
  readonly reason: string;
  readonly status: SiteBuildStatus;
  readonly targetVersion: number;
  readonly requestedBy: string;
  readonly requestedAt: number;
  readonly startedAt?: number;
  readonly completedAt?: number;
  readonly providerBuildId?: string;
  readonly providerStage?: SiteBuildProviderStage;
  readonly providerCheckedAt?: number;
  readonly error?: string;
  readonly errorPath?: string;
}): SiteBuildRecordDto {
  return {
    id: build.id,
    reason: build.reason,
    status: build.status,
    targetVersion: build.targetVersion,
    requestedBy: build.requestedBy,
    requestedAt: toIsoTimestamp(build.requestedAt),
    ...(build.startedAt === undefined ? {} : { startedAt: toIsoTimestamp(build.startedAt) }),
    ...(build.completedAt === undefined ? {} : { completedAt: toIsoTimestamp(build.completedAt) }),
    ...(build.providerBuildId === undefined ? {} : { providerBuildId: build.providerBuildId }),
    ...(build.providerStage === undefined ? {} : { providerStage: build.providerStage }),
    ...(build.providerCheckedAt === undefined
      ? {}
      : { providerCheckedAt: toIsoTimestamp(build.providerCheckedAt) }),
    ...(build.error === undefined ? {} : { error: normalizeBuildFailure(build.error).reason }),
    ...(build.error === undefined ||
    normalizeBuildFailure(build.error, build.errorPath).path === undefined
      ? {}
      : { errorPath: normalizeBuildFailure(build.error, build.errorPath).path! }),
  };
}
