import type {
  AdminContentEntryDto,
  BuildExportPageDto,
  BuildTokenCreatedDto,
  ErrorEnvelope,
  ManagedUserListDto,
  OAuthConnectionListDto,
  ReferenceImpactPageDto,
  ReferenceTargetPageDto,
  ReferenceTargetStatusesDto,
  SiteBuildListDto,
} from "@lacecms/contracts";
import type { saveDraftRequestSchema } from "@lacecms/contracts";
import type { createLaceApp } from "@lacecms/server";
import { hc, type InferRequestType, type InferResponseType } from "hono/client";
import type { InferInput } from "valibot";
import { expectTypeOf, test } from "vitest";

const v1 = hc<ReturnType<typeof createLaceApp>>("https://lace.test").api.v1;

test("the mounted client infers validated requests and their JSON replies", () => {
  const draft = v1.admin.entries[":entryId"].draft;
  type Save = typeof draft.$put;
  type SaveInput = InferRequestType<Save>;
  expectTypeOf<SaveInput["param"]>().toEqualTypeOf<{ entryId: string }>();
  expectTypeOf<SaveInput["json"]>().toEqualTypeOf<InferInput<typeof saveDraftRequestSchema>>();
  expectTypeOf<SaveInput>().not.toExtend<{ param: { entryId: number } }>();
  expectTypeOf<{ param: { entryId: string }; json: { title: string } }>().not.toExtend<SaveInput>();
  expectTypeOf<typeof draft>().not.toHaveProperty("$get");
  expectTypeOf<Awaited<ReturnType<Save>>["status"]>().toEqualTypeOf<200 | 422>();
  expectTypeOf<InferResponseType<Save, 200>>().toEqualTypeOf<AdminContentEntryDto>();
  expectTypeOf<InferResponseType<Save, 422>>().toEqualTypeOf<ErrorEnvelope>();

  type LinkTargets = (typeof v1.admin)["link-targets"]["$get"];
  expectTypeOf<InferRequestType<LinkTargets>["query"]["limit"]>().toEqualTypeOf<
    string | undefined
  >();
  expectTypeOf<InferResponseType<LinkTargets, 422>>().toEqualTypeOf<ErrorEnvelope>();

  type IssueToken = (typeof v1.admin)["api-tokens"]["$post"];
  expectTypeOf<Awaited<ReturnType<IssueToken>>["status"]>().toEqualTypeOf<201 | 422>();
  expectTypeOf<InferResponseType<IssueToken, 201>>().toEqualTypeOf<BuildTokenCreatedDto>();
});

test("protected cursor reads infer decimal query inputs and their paged DTOs", () => {
  type Users = (typeof v1.admin.users)["$get"];
  type Builds = (typeof v1.admin)["site-builds"]["$get"];
  type Connections = (typeof v1.account)["mcp-connections"]["$get"];
  expectTypeOf<NonNullable<InferRequestType<Users>["query"]>["limit"]>().toEqualTypeOf<
    string | undefined
  >();
  expectTypeOf<NonNullable<InferRequestType<Builds>["query"]>["after"]>().toEqualTypeOf<
    string | undefined
  >();
  expectTypeOf<InferResponseType<Users, 200>>().toEqualTypeOf<ManagedUserListDto>();
  expectTypeOf<InferResponseType<Builds, 200>>().toEqualTypeOf<SiteBuildListDto>();
  expectTypeOf<InferResponseType<Connections, 200>>().toEqualTypeOf<OAuthConnectionListDto>();
  expectTypeOf<InferResponseType<Connections, 422>>().toEqualTypeOf<ErrorEnvelope>();
});

test("the mounted client keeps empty and binary replies separate from JSON", () => {
  type DeleteEntry = (typeof v1.admin.entries)[":entryId"]["$delete"];
  expectTypeOf<Awaited<ReturnType<DeleteEntry>>["status"]>().toEqualTypeOf<204 | 422>();
  expectTypeOf<InferResponseType<DeleteEntry, 204>>().toEqualTypeOf<null>();

  type BuildExport = (typeof v1.public)["build-export"]["$get"];
  expectTypeOf<Awaited<ReturnType<BuildExport>>["status"]>().toEqualTypeOf<200 | 304>();
  expectTypeOf<InferResponseType<BuildExport, 200>>().toEqualTypeOf<BuildExportPageDto>();
  expectTypeOf<InferResponseType<BuildExport, 304>>().toEqualTypeOf<null>();

  type Media = (typeof v1.public.media)[":mediaId"]["$get"];
  expectTypeOf<Awaited<ReturnType<Media>>["status"]>().toEqualTypeOf<200 | 304 | 404 | 422>();
  expectTypeOf<InferResponseType<Media, 200>>().toEqualTypeOf<ReadableStream<Uint8Array>>();
  expectTypeOf<InferResponseType<Media, 304>>().toEqualTypeOf<null>();
});

test("reference management infers separate picker, resolver and impact contracts", () => {
  type Catalog = (typeof v1.admin)["reference-targets"];
  type Targets = Catalog["$get"];
  type Resolve = Catalog["resolve"]["$post"];
  type Impact = (typeof v1.admin.entries)[":entryId"]["reference-impact"]["$get"];
  expectTypeOf<InferRequestType<Targets>["query"]["modelKey"]>().toEqualTypeOf<string | string[]>();
  expectTypeOf<InferRequestType<Resolve>["json"]>().toEqualTypeOf<{ ids: string[] }>();
  expectTypeOf<InferResponseType<Targets, 200>>().toEqualTypeOf<ReferenceTargetPageDto>();
  expectTypeOf<InferResponseType<Resolve, 200>>().toEqualTypeOf<ReferenceTargetStatusesDto>();
  expectTypeOf<InferResponseType<Impact, 200>>().toEqualTypeOf<ReferenceImpactPageDto>();
});
