import type { PreviewExecution, PreviewFrozenInputs } from "@lacecms/application";
import {
  toBuildExportDto,
  toIsoTimestamp,
  toPublicBlockDto,
  toPublicMediaDictionary,
  toSeoDto,
  type ExportSeoDto,
  type PublicMediaDto,
} from "@lacecms/contracts";
import type { FrozenPreviewInput } from "@lacecms/contracts/preview";

export interface PreviewInputMetadata {
  readonly siteUrl: string;
  readonly seo: ExportSeoDto;
}

export function runnerInput(
  execution: PreviewExecution,
  input: NonNullable<Awaited<ReturnType<PreviewFrozenInputs<PreviewInputMetadata>["read"]>>>,
): FrozenPreviewInput {
  const { generation } = execution;
  const { target, pages, metadata } = input;
  const noUrl = () => "";
  const context = toBuildExportDto(
    {
      entries: pages.flatMap((page) => page.entries),
      globals: pages.flatMap((page) => page.globals ?? []),
      records: pages.flatMap((page) => page.records),
      version: generation.publicVersion,
    },
    noUrl,
    metadata.seo,
  );
  const withoutUrls = (items: Record<string, PublicMediaDto>) =>
    Object.fromEntries(Object.entries(items).map(([id, { url: _url, ...media }]) => [id, media]));
  return {
    schemaVersion: 1,
    generationId: generation.id,
    capturedAt: toIsoTimestamp(generation.createdAt),
    revision: generation.revision,
    siteUrl: metadata.siteUrl,
    target: {
      id: generation.entryId,
      modelKey: generation.modelKey,
      path: generation.path,
      title: target.title,
      ...(target.slug === undefined ? {} : { slug: target.slug }),
      fields: target.fields,
      blocks: target.blocks.map(toPublicBlockDto),
      internalLinks: [...target.internalLinks],
      ...(Object.hasOwn(metadata.seo.models, generation.modelKey) && {
        seo: toSeoDto(target.seo as Parameters<typeof toSeoDto>[0]),
      }),
    },
    targetMedia: withoutUrls(toPublicMediaDictionary(target.media, noUrl)),
    context: { ...context, media: withoutUrls(context.media) },
  };
}
