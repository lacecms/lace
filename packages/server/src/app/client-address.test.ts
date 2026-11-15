import { expect, test } from "vitest";
import { fixture } from "../test-support/app-harness.js";

test("captures ingress identity before streamed body replacement for both consumers", async () => {
  const seen: Array<{ address: string | undefined; request: Request }> = [];
  let original: Request;
  const { app } = await fixture({
    clientAddress: (request) => (request === original ? "203.0.113.7" : "unexpected"),
    rateLimiter: {
      check: async ({ clientAddress, request }) => {
        seen.push({ address: clientAddress, request });
        return true;
      },
    },
    auth: {
      fetch: async (request, address) => {
        seen.push({ address, request });
        return new Response(await request.text());
      },
    },
  });
  const body = '{"email":"a@example.test","password":"test"}';
  original = new Request("https://lace.test/api/auth/sign-in/email", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "transfer-encoding": "chunked",
      "x-lace-client-address": "spoofed",
    },
    body: new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(body));
        controller.close();
      },
    }),
    duplex: "half",
  } as RequestInit);
  const response = await app.fetch(original);
  expect(await response.text()).toBe(body);
  expect(seen.map(({ address }) => address)).toEqual(["203.0.113.7", "203.0.113.7"]);
  expect(seen[0]?.request).not.toBe(original);
});

test("direct calls use fallback despite caller headers", async () => {
  const addresses: Array<string | undefined> = [];
  const { app } = await fixture({
    rateLimiter: {
      check: async ({ clientAddress }) => {
        addresses.push(clientAddress);
        return true;
      },
    },
    auth: {
      fetch: async (_request, address) => {
        addresses.push(address);
        return new Response();
      },
    },
  });
  await app.request("/api/auth/sign-in/email", {
    method: "POST",
    headers: { "x-lace-client-address": "spoofed" },
    body: "{}",
  });
  expect(addresses).toEqual(["0.0.0.0", "0.0.0.0"]);
});
