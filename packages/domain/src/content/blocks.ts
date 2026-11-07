import { deepFreeze } from "@lacecms/content";
import type { JsonObject } from "@lacecms/content";
import type { BlockKey } from "../shared/brands.js";
import { DomainError } from "../shared/errors.js";
import { cloneJson, fail } from "../shared/failures.js";

export const BLOCK_POSITION_STEP = 1_000;

/** A deliberately bounded ordering diagnostic safe to carry across transport boundaries. */
export class BlockOrderError extends DomainError {
  public constructor(index: number, key: string) {
    const safeKey = /^[0-7][0-9A-HJKMNP-TV-Z]{25}$/u.test(key) ? ` (key ${key})` : "";
    super(
      "CONTENT_INVALID_STATE",
      `Block at index ${Number.isSafeInteger(index) && index >= 0 ? index : 0}${safeKey} has an invalid position. Positions must be positive safe integers in strictly increasing order. Resubmit positions in the displayed block order.`,
    );
    this.name = "BlockOrderError";
  }
}

/**
 * One block in a flat, fully ordered content snapshot, with its presentation
 * envelope: an optional in-page anchor and CSS class name, whether it is
 * hidden from delivery, and the settings its definition declares.
 */
export interface ContentBlock {
  readonly anchor?: string;
  readonly className?: string;
  readonly data: JsonObject;
  readonly hidden: boolean;
  readonly key: BlockKey;
  readonly position: number;
  readonly schemaVersion: number;
  readonly settings: JsonObject;
  readonly type: string;
}

/** A block whose envelope values may be omitted; omitted values take their defaults. */
export type ContentBlockInput = Omit<ContentBlock, "hidden" | "settings"> & {
  readonly hidden?: boolean;
  readonly settings?: JsonObject;
};

/** Copies a block, completing omitted envelope values as visible with `{}` settings. */
export function cloneBlock(block: ContentBlockInput): ContentBlock {
  return {
    ...(typeof block.anchor === "string" ? { anchor: block.anchor } : {}),
    ...(typeof block.className === "string" ? { className: block.className } : {}),
    data: cloneJson(block.data) as JsonObject,
    hidden: block.hidden === true,
    key: block.key,
    position: block.position,
    schemaVersion: block.schemaVersion,
    settings: cloneJson(block.settings ?? {}) as JsonObject,
    type: block.type,
  };
}

function assertBlockKeys(blocks: readonly ContentBlockInput[]): void {
  const keys = new Set<string>();
  for (const block of blocks) {
    if (typeof block.key !== "string" || block.key.length === 0) {
      fail("CONTENT_INVALID_STATE", "Every block must have a stable key.");
    }
    if (keys.has(block.key)) {
      fail("CONTENT_INVALID_STATE", `Duplicate block key ${block.key}.`);
    }
    keys.add(block.key);
  }
}

/** Validates the strict sparse ordering stored with a complete block aggregate. */
export function assertOrderedBlockPositions(blocks: readonly ContentBlockInput[]): void {
  assertBlockKeys(blocks);
  let previousPosition = 0;
  for (const [index, block] of blocks.entries()) {
    if (!Number.isSafeInteger(block.position) || block.position <= 0) {
      throw new BlockOrderError(index, block.key);
    }
    if (block.position <= previousPosition) {
      throw new BlockOrderError(index, block.key);
    }
    previousPosition = block.position;
  }
}

export type BlockPositionPlan =
  | Readonly<{ readonly kind: "position"; readonly position: number }>
  | Readonly<{ readonly kind: "normalize" }>;

/** Calculates an insertion position or declares that the whole list must be normalized. */
export function planBlockPosition(
  previousPosition: number | undefined,
  nextPosition: number | undefined,
): BlockPositionPlan {
  if (
    previousPosition !== undefined &&
    (!Number.isSafeInteger(previousPosition) || previousPosition <= 0)
  ) {
    fail("CONTENT_INVALID_STATE", "previousPosition must be a positive safe integer.");
  }
  if (nextPosition !== undefined && (!Number.isSafeInteger(nextPosition) || nextPosition <= 0)) {
    fail("CONTENT_INVALID_STATE", "nextPosition must be a positive safe integer.");
  }
  if (previousPosition !== undefined && nextPosition !== undefined) {
    if (previousPosition >= nextPosition) {
      fail("CONTENT_INVALID_STATE", "previousPosition must be less than nextPosition.");
    }
    const position = Math.floor((previousPosition + nextPosition) / 2);
    return position === previousPosition
      ? deepFreeze({ kind: "normalize" })
      : deepFreeze({ kind: "position", position });
  }
  if (previousPosition === undefined && nextPosition === undefined) {
    return deepFreeze({ kind: "position", position: BLOCK_POSITION_STEP });
  }
  if (previousPosition === undefined) {
    const position = Math.floor(nextPosition! / 2);
    return position === 0
      ? deepFreeze({ kind: "normalize" })
      : deepFreeze({ kind: "position", position });
  }
  if (previousPosition > Number.MAX_SAFE_INTEGER - BLOCK_POSITION_STEP) {
    return deepFreeze({ kind: "normalize" });
  }
  return deepFreeze({ kind: "position", position: previousPosition + BLOCK_POSITION_STEP });
}

/** Renumbers a flat block list without changing its supplied order. */
export function normalizeBlockPositions(blocks: readonly ContentBlock[]): readonly ContentBlock[] {
  assertBlockKeys(blocks);
  return deepFreeze(
    blocks.map((block, index) => ({
      ...cloneBlock(block),
      position: (index + 1) * BLOCK_POSITION_STEP,
    })),
  );
}
