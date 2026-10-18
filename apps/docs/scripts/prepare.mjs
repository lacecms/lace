import { copyFile, mkdir } from "node:fs/promises";
await mkdir(new URL("../public/reference/", import.meta.url), { recursive: true });
await copyFile(
  new URL("../../api/openapi/api-v1.json", import.meta.url),
  new URL("../public/reference/openapi.json", import.meta.url),
);
