// Kept apart from the import modules so `lace --help` loads no import code.
export const importUsage =
  "Usage: lace import <dir> [--url <origin>] [--publish] [--dry-run] [--overwrite] [--state <path>] [--json]\n       lace import <dir> --validate-only [--publish] [--json]\nLoads a format-v1 import package into a running installation through the admin API. Run it from the CMS project root that contains lace.config.ts. The token is read only from LACE_IMPORT_TOKEN; the API origin from --url or LACE_API_BASE_URL. --validate-only checks the package offline.";
