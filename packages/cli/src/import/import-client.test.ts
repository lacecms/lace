import * as v from "valibot";
import { describe, expect, test } from "vitest";
import {
  ImportClient,
  parseApiOrigin,
  retryAfterSeconds,
  type ImportClientOptions,
} from "./import-client.js";
import { ImportError } from "./import-format.js";

const TOKEN = "sentinel-token-value";
const schema = v.strictObject({ ok: v.boolean() });

function client(
  responses: (
    | { status: number; body?: unknown; headers?: ConstructorParameters<typeof Headers>[0] }
    | Error
  )[],
  options: Partial<ImportClientOptions> = {},
) {
  const calls: { url: string; init: RequestInit | undefined }[] = [];
  const waits: number[] = [];
  const fetch: typeof globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    const next = responses.shift();
    if (next instanceof Error) throw next;
    if (!next) throw new Error("Missing response fixture");
    return new Response(next.body === undefined ? null : JSON.stringify(next.body), {
      status: next.status,
      ...(next.headers === undefined ? {} : { headers: next.headers }),
    });
  };
  return {
    calls,
    waits,
    client: new ImportClient({
      origin: "https://cms.example.com",
      token: TOKEN,
      fetch,
      sleep: async (ms) => {
        waits.push(ms);
      },
      now: () => Date.parse("2026-11-01T00:00:00Z"),
      ...options,
    }),
  };
}

const request = {
  method: "GET" as const,
  path: "/api/v1/admin/media",
  what: "Media lookup",
  schema,
  expect: [200],
};

async function error(promise: Promise<unknown>): Promise<ImportError> {
  try {
    await promise;
  } catch (failure) {
    if (!(failure instanceof ImportError)) throw failure;
    return failure;
  }
  throw new Error("expected failure");
}

describe("import API client", () => {
  test("origins require https except loopback and refuse paths and credentials", () => {
    expect(parseApiOrigin("https://cms.example.com/")).toBe("https://cms.example.com");
    expect(parseApiOrigin("http://localhost:8787")).toBe("http://localhost:8787");
    expect(parseApiOrigin("http://api.localhost")).toBe("http://api.localhost");
    expect(parseApiOrigin("http://127.0.0.1:3000")).toBe("http://127.0.0.1:3000");
    expect(parseApiOrigin("http://[::1]:3000")).toBe("http://[::1]:3000");
    for (const value of [
      "http://cms.example.com",
      "https://user:pass@cms.example.com",
      "https://cms.example.com/?x=1",
      "https://cms.example.com/api",
      "ftp://cms.example.com",
      "not a url",
    ])
      expect(() => parseApiOrigin(value)).toThrow(
        expect.objectContaining({ code: "IMPORT_USAGE" }),
      );
  });

  test("sends the token only as a Bearer header and validates the response", async () => {
    const { client: api, calls } = client([{ status: 200, body: { ok: true } }]);
    const response = await api.request({ ...request, query: { sha256: "a".repeat(64) } });
    expect(response.body).toEqual({ ok: true });
    expect(calls[0]!.url).toBe(
      `https://cms.example.com/api/v1/admin/media?sha256=${"a".repeat(64)}`,
    );
    expect(calls[0]!.url).not.toContain(TOKEN);
    expect(new Headers(calls[0]!.init?.headers).get("authorization")).toBe(`Bearer ${TOKEN}`);
  });

  test("429 waits for Retry-After, clamps it and retries the same request", async () => {
    const {
      client: api,
      calls,
      waits,
    } = client([
      { status: 429, headers: { "retry-after": "20" } },
      { status: 429, headers: { "retry-after": "9999" } },
      { status: 429, headers: { "retry-after": "Sat, 01 Nov 2026 00:00:30 GMT" } },
      { status: 200, body: { ok: true } },
    ]);
    await api.request(request);
    expect(waits).toEqual([20_000, 300_000, 30_000]);
    expect(calls).toHaveLength(4);
    expect(retryAfterSeconds(null, 0)).toBe(5);
  });

  test("the wait bound ends with IMPORT_RATE_LIMITED", async () => {
    const { client: api } = client(Array.from({ length: 11 }, () => ({ status: 429 })));
    expect((await error(api.request(request))).code).toBe("IMPORT_RATE_LIMITED");
  });

  test("denials, failures and unexpected bodies are sanitized and never contain the token", async () => {
    const denied = await error(
      client([
        { status: 403, body: { error: { code: "AUTHORIZATION_DENIED", message: TOKEN } } },
      ]).client.request(request),
    );
    expect(denied.code).toBe("IMPORT_UNAUTHORIZED");
    expect(denied.message).toContain("AUTHORIZATION_DENIED");
    const conflict = await error(
      client([
        { status: 409, body: { error: { code: "CONTENT_REVISION_CONFLICT", message: TOKEN } } },
      ]).client.request(request),
    );
    expect(conflict).toMatchObject({ code: "IMPORT_FAILED" });
    expect(conflict.message).toContain("CONTENT_REVISION_CONFLICT");
    const unexpected = await error(
      client([{ status: 200, body: { ok: TOKEN } }]).client.request(request),
    );
    const offline = await error(client([new Error(TOKEN)]).client.request(request));
    for (const failure of [denied, conflict, unexpected, offline])
      expect(`${failure.message} ${JSON.stringify(failure)}`).not.toContain(TOKEN);
  });
});
