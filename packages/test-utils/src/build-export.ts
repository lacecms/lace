import type {
  BuildContentExportPage,
  OpaqueCursor,
  PublicContentEntry,
  PublicContentReadPort,
  PublicGlobalContent,
} from "@lacecms/application";
import {
  buildExportContinuationPageSchema,
  buildExportFirstPageSchema,
  buildExportSchema,
} from "@lacecms/contracts";
import type {
  BuildExportContinuationPageDto,
  BuildExportDto,
  BuildExportFirstPageDto,
  PublicMediaDto,
} from "@lacecms/contracts";
import * as v from "valibot";

/** Follows every build-export page of an unchanged state and concatenates the content. */
export async function readAllBuildContentPages(
  port: Pick<PublicContentReadPort, "exportBuildContentPage">,
  limit = 100,
): Promise<{
  readonly entries: readonly PublicContentEntry[];
  readonly globals: readonly PublicGlobalContent[];
  readonly pages: readonly BuildContentExportPage[];
  readonly version: number;
}> {
  const pages: BuildContentExportPage[] = [];
  let after: OpaqueCursor | undefined;
  do {
    const page = await port.exportBuildContentPage({
      ...(after === undefined ? {} : { after }),
      limit,
    });
    pages.push(page);
    after = page.nextCursor;
  } while (after !== undefined);
  return {
    entries: pages.flatMap((page) => page.entries),
    globals: pages[0]!.globals ?? [],
    pages,
    version: pages[0]!.version,
  };
}

/** The response surface `readCompleteBuildExport` needs from any HTTP client. */
export interface BuildExportHttpResponse {
  readonly headers: { get(name: string): string | null };
  readonly status: number;
  json(): Promise<unknown>;
}

export type BuildExportHttpFetch = (
  url: string,
  init: { readonly headers: Record<string, string> },
) => Promise<BuildExportHttpResponse> | BuildExportHttpResponse;

export interface CompleteBuildExport {
  /** The strong ETag of the first page. */
  readonly etag: string;
  /** The assembled export, strictly validated. */
  readonly export: BuildExportDto;
  /** Every strictly validated page in order. */
  readonly pages: readonly (BuildExportFirstPageDto | BuildExportContinuationPageDto)[];
}

/**
 * Reads the raw REST build export the way an external client must: it follows
 * `nextCursor`, validates every page and the assembled export with the strict
 * schemas, and checks that all pages agree on version, format and path order.
 */
export async function readCompleteBuildExport(
  fetch: BuildExportHttpFetch,
  baseUrl: string,
  token?: string,
  options: { readonly headers?: Record<string, string>; readonly limit?: number } = {},
): Promise<CompleteBuildExport> {
  const endpoint = `${baseUrl.replace(/\/+$/u, "")}/api/v1/public/build-export`;
  const headers = {
    ...options.headers,
    ...(token === undefined ? {} : { authorization: `Bearer ${token}` }),
  };
  const pages: (BuildExportFirstPageDto | BuildExportContinuationPageDto)[] = [];
  let etag: string | undefined;
  let after: string | undefined;
  do {
    const query = [
      ...(after === undefined ? [] : [`after=${encodeURIComponent(after)}`]),
      ...(options.limit === undefined ? [] : [`limit=${options.limit}`]),
    ];
    const response = await fetch(query.length === 0 ? endpoint : `${endpoint}?${query.join("&")}`, {
      headers,
    });
    if (response.status !== 200) {
      throw new Error(`The build-export page returned HTTP ${response.status}.`);
    }
    const body = await response.json();
    const page =
      after === undefined
        ? v.parse(buildExportFirstPageSchema, body)
        : v.parse(buildExportContinuationPageSchema, body);
    const pageTag = response.headers.get("etag");
    if (pageTag !== `"${page.version}"`) {
      throw new Error(`The build-export page ETag ${pageTag} does not encode ${page.version}.`);
    }
    if (pages[0] !== undefined && pages[0].version !== page.version) {
      throw new Error("The build-export pages report different versions.");
    }
    const previous = pages.at(-1)?.entries.at(-1)?.path;
    if (
      previous !== undefined &&
      page.entries[0] !== undefined &&
      page.entries[0].path <= previous
    ) {
      throw new Error("The build-export pages do not continue in path order.");
    }
    etag ??= pageTag;
    pages.push(page);
    after = page.nextCursor;
  } while (after !== undefined);
  const first = pages[0] as BuildExportFirstPageDto;
  const media = new Map<string, PublicMediaDto>();
  for (const page of pages) {
    for (const [id, item] of Object.entries(page.media)) {
      const known = media.get(id);
      if (known !== undefined && JSON.stringify(known) !== JSON.stringify(item)) {
        throw new Error(`The build-export pages resolve media ${id} differently.`);
      }
      media.set(id, item);
    }
  }
  const assembled = v.parse(buildExportSchema, {
    entries: pages.flatMap((page) => page.entries),
    formatVersion: first.formatVersion,
    globals: first.globals,
    media: Object.fromEntries([...media.keys()].sort().map((id) => [id, media.get(id)!])),
    seo: first.seo,
    version: first.version,
  });
  return { etag: etag!, export: assembled, pages };
}
