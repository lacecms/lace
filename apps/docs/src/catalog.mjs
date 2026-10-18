import catalog from "./catalog.json" with { type: "json" };
export function validateCatalog(value) {
  if (!value.locales?.[value.defaultLocale] || !value.versions?.[value.defaultVersion])
    throw new Error("Unknown default documentation locale/version");
  for (const [slug, entry] of [
    ...Object.entries(value.locales),
    ...Object.entries(value.versions),
  ]) {
    if (!/^[a-z0-9][a-z0-9-]*$/.test(slug) || !entry.label)
      throw new Error(`Invalid documentation variant: ${slug}`);
  }
  for (const version of Object.values(value.versions))
    if (!version.target) throw new Error("Missing target CMS version");
  return value;
}
export default validateCatalog(catalog);
