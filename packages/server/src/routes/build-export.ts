import { BuildExportCursorError, opaqueCursor } from "@lacecms/application";
import type { PublicContentReadPort } from "@lacecms/application";
import { buildExportQuerySchema, MAX_BUILD_EXPORT_PAGE_SIZE } from "@lacecms/contracts";
import { invalid, parse } from "../shared/http.js";

export function readBuildExportQuery(url: URL) {
  const raw: Record<string, string> = {};
  for (const [key, value] of url.searchParams) {
    if (Object.hasOwn(raw, key)) invalid("A query parameter is repeated.", `/${key}`);
    raw[key] = value;
  }
  return parse(buildExportQuerySchema, raw);
}

export async function readBuildExportPage(
  publicContent: PublicContentReadPort,
  query: ReturnType<typeof readBuildExportQuery>,
) {
  try {
    return await publicContent.exportBuildContentPage({
      ...(query.after === undefined ? {} : { after: opaqueCursor(query.after) }),
      limit: query.limit ?? MAX_BUILD_EXPORT_PAGE_SIZE,
    });
  } catch (error) {
    if (error instanceof BuildExportCursorError) invalid("The cursor is invalid.", "/after");
    throw error;
  }
}
