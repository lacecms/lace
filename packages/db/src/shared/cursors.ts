import { opaqueCursor } from "@lacecms/application";
import { DomainError } from "@lacecms/domain";
import { decodeBase64Url, encodeBase64Url } from "./base64.js";
import { failure } from "./failures.js";
import { SQL_CURSOR_VERSION, SQL_SORT_CURSOR_VERSION } from "./limits.js";
import { assertTimestamp } from "./values.js";
export interface DecodedCursor {
  readonly id: string;
  readonly timestamp: number;
}

export interface DecodedSortCursor {
  readonly id: string;
  readonly value: number | string;
}

export function parseCursorObject(value: string): Record<string, unknown> {
  if (!/^[A-Za-z0-9_-]+$/u.test(value)) failure("Cursor is not base64url encoded.");
  try {
    const parsed: unknown = JSON.parse(decodeBase64Url(value));
    if (
      parsed === null ||
      typeof parsed !== "object" ||
      Array.isArray(parsed) ||
      Object.keys(parsed).length !== 4
    ) {
      failure("Cursor has an invalid shape.");
    }
    return parsed as Record<string, unknown>;
  } catch (error) {
    if (error instanceof DomainError) throw error;
    failure("Cursor contains invalid JSON.");
  }
}

export function encodeCursor(
  kind: string,
  timestamp: number,
  id: string,
): ReturnType<typeof opaqueCursor> {
  return opaqueCursor(
    encodeBase64Url(JSON.stringify({ id, kind, timestamp, version: SQL_CURSOR_VERSION })),
  );
}

export function decodeCursor(value: string, kind: string): DecodedCursor {
  const candidate = parseCursorObject(value);
  if (
    candidate.version !== SQL_CURSOR_VERSION ||
    candidate.kind !== kind ||
    typeof candidate.id !== "string" ||
    candidate.id.length === 0 ||
    typeof candidate.timestamp !== "number"
  ) {
    failure("Cursor is unsupported or belongs to a different list.");
  }
  return { id: candidate.id, timestamp: assertTimestamp(candidate.timestamp, "Cursor timestamp") };
}

export function encodeSortCursor(
  kind: string,
  value: number | string,
  id: string,
): ReturnType<typeof opaqueCursor> {
  return opaqueCursor(
    encodeBase64Url(JSON.stringify({ id, kind, value, version: SQL_SORT_CURSOR_VERSION })),
  );
}

export function decodeSortCursor(
  value: string,
  kind: string,
  validValue: (sortValue: unknown) => boolean,
): DecodedSortCursor {
  const candidate = parseCursorObject(value);
  if (
    candidate.version !== SQL_SORT_CURSOR_VERSION ||
    candidate.kind !== kind ||
    typeof candidate.id !== "string" ||
    candidate.id.length === 0
  ) {
    failure("Cursor is unsupported or belongs to a different list.");
  }
  if (!validValue(candidate.value)) failure("Cursor sort value is invalid.");
  return { id: candidate.id, value: candidate.value as number | string };
}
