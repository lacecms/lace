import { isPortableJsonValue, type JsonObject, type JsonValue } from "@lacecms/content";
import * as v from "valibot";

export function isJsonObject(value: unknown): value is JsonObject {
  return (
    !Array.isArray(value) &&
    value !== null &&
    typeof value === "object" &&
    isPortableJsonValue(value)
  );
}

/** Any portable JSON value: exactly the set content configuration accepts. */
export const jsonValueSchema = v.custom<JsonValue>(isPortableJsonValue);
export const jsonObjectSchema = v.custom<JsonObject>(isJsonObject);
