import { blockKey } from "@lacecms/domain";
import type { ContentBlock } from "@lacecms/domain";
import type { BlockRow } from "./blocks.js";
import { parseObject } from "../shared/values.js";

export function storedBlock(row: BlockRow): ContentBlock {
  return {
    ...(row.anchor === null ? {} : { anchor: row.anchor }),
    ...(row.class_name === null ? {} : { className: row.class_name }),
    data: parseObject(row.data_json, "Block data"),
    hidden: row.hidden === 1,
    key: blockKey(row.block_key),
    position: row.position,
    schemaVersion: row.schema_version,
    settings: parseObject(row.settings_json, "Block settings"),
    type: row.block_type,
  };
}
