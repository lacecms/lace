import { mediaId, unixMilliseconds } from "@lacecms/domain";
import { type ContractSql, editor } from "../shared.js";
import { lifecycleState } from "../entries/fixtures.js";

export function metadataUpdate(
  id: string,
  expectedUpdatedAt: number,
  updatedAt: number,
  values: {
    readonly alt?: string | null;
    readonly caption?: string | null;
    readonly focalPoint?: { readonly x: number; readonly y: number } | null;
  } = {},
) {
  return {
    alt: values.alt ?? null,
    caption: values.caption ?? null,
    expectedUpdatedAt: unixMilliseconds(expectedUpdatedAt),
    focalPoint: values.focalPoint ?? null,
    mediaId: mediaId(id),
    requestedBy: editor,
    updatedAt: unixMilliseconds(updatedAt),
  };
}

export async function mediaMetadataState(
  sql: ContractSql,
): Promise<Record<string, readonly unknown[]>> {
  return {
    ...(await lifecycleState(sql)),
    media: await sql.all("select * from media order by id"),
    tags: await sql.all("select * from media_tags order by media_id, tag"),
  };
}

export async function pendingBuilds(sql: ContractSql) {
  const rows = await sql.all<{ payload_json: string }>(
    "select payload_json from outbox_events where type = 'site.build.requested' and processed_at is null",
  );
  return rows.map((row) => JSON.parse(row.payload_json) as Record<string, unknown>);
}
