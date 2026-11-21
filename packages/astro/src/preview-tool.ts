import process from "node:process";
import { createPreviewInputClient } from "@lacecms/sdk/preview";
import { stageAstroPreviewInput } from "./preview/stage.js";
import { packageAstroPreview } from "./preview/package.js";

// This image-pinned helper runs outside the site installation. Credentials arrive on stdin.
let value = "";
for await (const chunk of process.stdin.setEncoding("utf8")) {
  value += chunk;
  if (value.length > 8192) throw new Error("Invalid preview tool request.");
}
try {
  const request = JSON.parse(value) as
    | {
        readonly action: "stage";
        readonly directory: string;
        readonly apiBaseUrl: string;
        readonly generationId: string;
        readonly claim: string;
      }
    | {
        readonly action: "package";
        readonly inputFile: string;
        readonly forbiddenValues: readonly string[];
      };
  const output =
    request.action === "stage"
      ? {
          inputFile: await stageAstroPreviewInput(
            request.directory,
            createPreviewInputClient(request),
          ),
        }
      : await packageAstroPreview(request.inputFile, { forbiddenValues: request.forbiddenValues });
  process.stdout.write(JSON.stringify(output));
} catch (error) {
  const reason =
    error instanceof Error ? /^PREVIEW_[A-Z_]+(?=:)/u.exec(error.message)?.[0] : undefined;
  process.stdout.write(JSON.stringify({ reason }));
  process.exitCode = 1;
}
