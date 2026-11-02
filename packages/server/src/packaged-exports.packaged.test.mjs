import { expect, test } from "vitest";

test("packaged entry point keeps its public exports", async () => {
  expect(Object.keys(await import("../dist/index.js")).sort()).toEqual([
    "DEFAULT_EMAIL_TIMEOUT_MS",
    "DEFAULT_RESEND_API_BASE_URL",
    "DEFAULT_SMTP_PORT",
    "IMPORT_ROUTE_ALLOWLIST",
    "createEmailSender",
    "createLaceApp",
    "createLogEmailSender",
    "createResendEmailSender",
    "defaultEmailFailureReporter",
    "emailDeliveryStatus",
    "isImportRoute",
    "packageName",
    "parseBuildSiteIdentity",
    "parseEmailSettings",
    "parseMcpEnabled",
    "sensitiveRequestLimit",
    "sensitiveRequestSubject",
  ]);
});
