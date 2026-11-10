import {
  adminSettingsStatusSchema,
  emailTestResultSchema,
  buildTokenCreatedSchema,
  buildTokenListSchema,
  buildTokenSchema,
  importTokenCreatedSchema,
  importTokenListSchema,
  importTokenSchema,
} from "@lacecms/contracts";
import { request, parse, type Fetcher } from "../admin-transport.js";

export function settingsClient(fetcher: Fetcher) {
  return {
    loadSettingsStatus: async () =>
      parse(adminSettingsStatusSchema, await request(fetcher, "/api/v1/admin/settings/status")),
    sendTestEmail: async () =>
      parse(
        emailTestResultSchema,
        await request(fetcher, "/api/v1/admin/settings/email-test", {
          body: "{}",
          headers: { "content-type": "application/json" },
          method: "POST",
        }),
      ),
    listTokens: async () =>
      parse(buildTokenListSchema, await request(fetcher, "/api/v1/admin/api-tokens")),
    createToken: async (name: string) =>
      parse(
        buildTokenCreatedSchema,
        await request(fetcher, "/api/v1/admin/api-tokens", {
          body: JSON.stringify({ name }),
          headers: { "content-type": "application/json" },
          method: "POST",
        }),
      ),
    revokeToken: async (tokenId: string) =>
      parse(
        buildTokenSchema,
        await request(fetcher, `/api/v1/admin/api-tokens/${encodeURIComponent(tokenId)}`, {
          method: "DELETE",
        }),
      ),
    listImportTokens: async () =>
      parse(importTokenListSchema, await request(fetcher, "/api/v1/admin/import-tokens")),
    createImportToken: async (input: {
      readonly allowPublish: boolean;
      readonly expiresInDays: number;
      readonly name: string;
    }) =>
      parse(
        importTokenCreatedSchema,
        await request(fetcher, "/api/v1/admin/import-tokens", {
          body: JSON.stringify({
            allowPublish: input.allowPublish,
            expiresInDays: input.expiresInDays,
            name: input.name,
          }),
          headers: { "content-type": "application/json" },
          method: "POST",
        }),
      ),
    revokeImportToken: async (tokenId: string) =>
      parse(
        importTokenSchema,
        await request(fetcher, `/api/v1/admin/import-tokens/${encodeURIComponent(tokenId)}`, {
          method: "DELETE",
        }),
      ),
  };
}
