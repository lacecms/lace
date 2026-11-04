import { isPlainObject } from "@lacecms/content";
import { fieldTypeCapabilities } from "@lacecms/content";
import type { FieldVisibility } from "@lacecms/content";
import type {
  FieldMap,
  ModelSeoDefinition,
  SeoDefaultsDefinition,
  NormalizedRoutableModel,
} from "./types.js";
import { fail } from "../shared/errors.js";
import { assertOnlyKeys } from "../shared/assertions.js";

function seoFieldReference(
  modelKey: string,
  option: string,
  key: unknown,
  fields: FieldMap,
  media: boolean,
): string {
  if (typeof key !== "string") {
    fail(`model "${modelKey}" ${option} must name a field.`);
  }
  const definition = Object.hasOwn(fields, key) ? fields[key] : undefined;
  if (definition === undefined) {
    fail(`model "${modelKey}" ${option} references undeclared field "${key}".`);
  }
  const allowed = media
    ? definition.type === "media"
    : fieldTypeCapabilities[definition.type].seoText;
  if (!allowed) {
    fail(
      `model "${modelKey}" ${option} field "${key}" must be ${media ? "a media field" : "a text or textarea field"}, not ${definition.type}.`,
    );
  }
  return key;
}

/** Normalizes the routable-model SEO option and its temporary removal hint. */
export function normalizeRoutableSeo(
  input: { readonly key: string; readonly removedSeo?: unknown; readonly seo?: unknown },
  fields: FieldMap,
): NormalizedRoutableModel {
  if (Object.hasOwn(input, "seoDefaults")) {
    fail(`model "${input.key}" must not declare seoDefaults; only a global can.`);
  }
  let seo: ModelSeoDefinition | undefined;
  const option: unknown = input.seo;
  if (option === true) {
    seo = {};
  } else if (option !== undefined && option !== false) {
    if (
      option === null ||
      typeof option !== "object" ||
      Array.isArray(option) ||
      !isPlainObject(option)
    ) {
      fail(`model "${input.key}" seo must be a boolean or an object.`);
    }
    const mapping = option as Record<string, unknown>;
    assertOnlyKeys(mapping, ["description", "image"], `model "${input.key}" seo`);
    seo = {
      ...(mapping.description === undefined
        ? {}
        : {
            description: seoFieldReference(
              input.key,
              "seo.description",
              mapping.description,
              fields,
              false,
            ),
          }),
      ...(mapping.image === undefined
        ? {}
        : { image: seoFieldReference(input.key, "seo.image", mapping.image, fields, true) }),
    };
  }
  const hint: unknown = input.removedSeo;
  if (hint !== undefined && hint !== true) {
    fail(`model "${input.key}" removedSeo must be true when declared.`);
  }
  if (hint === true && seo !== undefined) {
    fail(`model "${input.key}" must not declare removedSeo while seo is enabled.`);
  }
  return {
    ...(hint === true ? { removedSeo: true as const } : {}),
    ...(seo === undefined ? {} : { seo }),
  };
}

export function normalizeSeoDefaults(
  input: { readonly key: string; readonly seoDefaults?: unknown },
  fields: FieldMap,
  visibility: FieldVisibility | undefined,
): SeoDefaultsDefinition | undefined {
  const option: unknown = input.seoDefaults;
  if (option === undefined) return undefined;
  if (
    option === null ||
    typeof option !== "object" ||
    Array.isArray(option) ||
    !isPlainObject(option)
  ) {
    fail(`global "${input.key}" seoDefaults must be an object.`);
  }
  const mapping = option as Record<string, unknown>;
  assertOnlyKeys(
    mapping,
    ["description", "image", "siteName", "titleTemplate"],
    `global "${input.key}" seoDefaults`,
  );
  if (mapping.siteName === undefined) {
    fail(`global "${input.key}" seoDefaults must name a siteName field.`);
  }
  // A site default must always be delivered, so it cannot name a conditional field.
  const unconditional = (option: string, key: string): string => {
    if (visibility !== undefined && Object.hasOwn(visibility, key))
      fail(`global "${input.key}" ${option} must not reference conditional field "${key}".`);
    return key;
  };
  const text = (name: string): string =>
    unconditional(
      `seoDefaults.${name}`,
      seoFieldReference(input.key, `seoDefaults.${name}`, mapping[name], fields, false),
    );
  return {
    ...(mapping.description === undefined ? {} : { description: text("description") }),
    ...(mapping.image === undefined
      ? {}
      : {
          image: unconditional(
            "seoDefaults.image",
            seoFieldReference(input.key, "seoDefaults.image", mapping.image, fields, true),
          ),
        }),
    siteName: text("siteName"),
    ...(mapping.titleTemplate === undefined ? {} : { titleTemplate: text("titleTemplate") }),
  };
}
