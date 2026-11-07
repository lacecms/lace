import { MAX_MEDIA_BYTES } from "@lacecms/application";
import { mediaTagsInputSchema, transportError } from "@lacecms/contracts";
import {
  MaxFileSizeExceededError,
  MultipartParseError,
  parseMultipartRequest,
} from "@mjackson/multipart-parser";
import * as v from "valibot";
import { errorResponse, invalid, validationResponse } from "../shared/http.js";

function mediaByteStream(chunks: readonly Uint8Array[]) {
  return {
    async *[Symbol.asyncIterator](): AsyncGenerator<Uint8Array> {
      for (const chunk of chunks) yield chunk.slice();
    },
  };
}

export async function readMediaUpload(request: Request) {
  try {
    let upload: { readonly chunks: readonly Uint8Array[]; readonly filename: string } | undefined;
    const tagParts: string[] = [];
    for await (const part of parseMultipartRequest(request, {
      maxFileSize: MAX_MEDIA_BYTES,
    })) {
      if (part.name !== "tags" && part.name !== "file")
        invalid("The submitted value is invalid.", `/tags/${tagParts.length}`);
      if (part.name === "tags") {
        if (part.isFile || tagParts.length >= 20)
          invalid("The submitted value is invalid.", `/tags/${tagParts.length}`);
        tagParts.push(part.text);
        continue;
      }
      if (
        !part.isFile ||
        part.name !== "file" ||
        part.filename === undefined ||
        upload !== undefined
      ) {
        invalid("The submitted value is invalid.", "/file");
      }
      upload = { chunks: part.content, filename: part.filename };
    }
    if (upload === undefined) invalid("The submitted value is invalid.", "/file");
    const parsedTags = v.safeParse(mediaTagsInputSchema, tagParts);
    if (!parsedTags.success) {
      const issues = parsedTags.issues.map((issue) => ({
        code: "invalid_value",
        message: "The submitted value is invalid.",
        path: `/tags${v.getDotPath(issue) === null ? "" : "/" + v.getDotPath(issue)?.replaceAll(".", "/")}`,
      }));
      return validationResponse(issues);
    }
    return {
      tags: parsedTags.output,
      body: mediaByteStream(upload.chunks),
      filename: upload.filename,
    };
  } catch (error) {
    if (error instanceof MaxFileSizeExceededError) {
      return errorResponse(transportError("PAYLOAD_TOO_LARGE"));
    }
    if (error instanceof MultipartParseError) {
      return validationResponse([
        { code: "invalid_value", message: "The submitted value is invalid.", path: "/file" },
      ]);
    }
    throw error;
  }
}
