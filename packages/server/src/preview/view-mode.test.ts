import { expect, test } from "vitest";
import { supportsPreviewFrame } from "./view-mode.js";

test.each([
  ["https://cms.example.co.uk", "https://preview.example.co.uk:8443", true],
  ["https://example.com", "https://preview.example.com", true],
  ["https://cms.account.workers.dev", "https://preview.account.workers.dev", true],
  ["https://cms.one.workers.dev", "https://preview.two.workers.dev", false],
  ["https://cms.pages.dev", "https://preview.pages.dev", false],
  ["https://cms.example.co.uk", "https://preview.other.co.uk", false],
  ["https://cms.example.com", "https://example.com.attacker.net", false],
  ["https://cms.lace.test", "https://preview.lace.test", false],
  ["https://127.0.0.1", "https://127.0.0.2", false],
  ["http://cms.example.com", "https://preview.example.com", false],
  ["https://cms.example.com", "https://cms.example.com:8443", false],
  ["https://cms.example.com", "https://preview.example.com.", false],
] as const)("classifies %s and %s", (adminOrigin, previewOrigin, expected) => {
  expect(supportsPreviewFrame({ adminOrigin, previewOrigin })).toBe(expected);
});
