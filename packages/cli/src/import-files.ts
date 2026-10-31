import { createHash } from "node:crypto";
import { readFile, realpath, stat } from "node:fs/promises";
import { basename, join, sep } from "node:path";
import {
  canonicalizeJson,
  detectMediaMimeType,
  MAX_MEDIA_BYTES,
  normalizeMediaTags,
} from "@lacecms/application";
import { updateMediaMetadataRequestSchema } from "@lacecms/contracts";
import * as v from "valibot";
import { ImportError, pointer } from "./import-format.js";
import type { ImportIssue, ImportMedia } from "./import-format.js";

/** A verified package media file; bytes are re-read only when uploading. */
export interface PackageMediaFile {
  readonly path: string;
  readonly filename: string;
  readonly size: number;
  readonly sha256: string;
  readonly mimeType: string;
}

/** Metadata a media item applies; an absent property leaves the server value. */
export interface MediaMetadataPatch {
  readonly alt?: string | null;
  readonly caption?: string | null;
  readonly focalPoint?: { readonly x: number; readonly y: number } | null;
  readonly tags?: readonly string[];
}

/** Relative POSIX path without empty, `.` or `..` segments, backslashes or drive letters. */
export function isSafeRelativePath(value: string): boolean {
  if (/[\\\0]/u.test(value) || value.startsWith("/") || /^[A-Za-z]:/u.test(value)) return false;
  return value.split("/").every((segment) => segment !== "" && segment !== "." && segment !== "..");
}

export function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/** Resolves a package path after following links; null when it leaves the root. */
async function containedPath(root: string, relative: string): Promise<string | null> {
  try {
    const resolved = await realpath(join(root, ...relative.split("/")));
    return resolved.startsWith(`${root}${sep}`) ? resolved : null;
  } catch {
    return null;
  }
}

/** Validates and normalizes one media item's metadata with the server's rules. */
export function mediaMetadata(
  item: ImportMedia,
  index: number,
  issues: ImportIssue[],
): MediaMetadataPatch {
  const patch: Record<string, unknown> = {};
  for (const name of ["alt", "caption", "focalPoint"] as const)
    if (item[name] !== undefined) patch[name] = item[name];
  if (item.tags !== undefined) {
    const normalized = normalizeMediaTags(item.tags);
    if ("issue" in normalized)
      issues.push({
        pointer: pointer("media", index, "tags", normalized.issue),
        message: "is not a valid tag, or the item has more than 20 distinct tags.",
      });
    else patch.tags = normalized.tags;
  }
  if (Object.keys(patch).length === 0) return {};
  const parsed = v.safeParse(updateMediaMetadataRequestSchema, patch);
  if (!parsed.success) {
    for (const issue of parsed.issues)
      issues.push({
        pointer: pointer(
          "media",
          index,
          ...(issue.path ?? []).map((item) => item.key as string | number),
        ),
        message: issue.message,
      });
    return {};
  }
  return patch as MediaMetadataPatch;
}

/** Comparable form of a metadata patch; tags as a sorted set. */
export function metadataFingerprint(patch: MediaMetadataPatch): string {
  return canonicalizeJson({
    alt: patch.alt === undefined ? "(absent)" : patch.alt,
    caption: patch.caption === undefined ? "(absent)" : patch.caption,
    focalPoint: patch.focalPoint === undefined ? "(absent)" : patch.focalPoint,
    tags: patch.tags === undefined ? "(absent)" : [...patch.tags].sort(),
  } as never);
}

export interface PackageMedia {
  readonly files: ReadonlyMap<string, PackageMediaFile>;
  readonly metadata: ReadonlyMap<string, MediaMetadataPatch>;
}

/**
 * Checks every media item: safe contained regular file, size limit, accepted
 * image format, metadata rules, and identical bytes carrying identical metadata.
 * Files are read one at a time; only hashes are kept.
 */
export async function inspectPackageMedia(
  root: string,
  media: readonly ImportMedia[],
  issues: ImportIssue[],
): Promise<PackageMedia> {
  const files = new Map<string, PackageMediaFile>();
  const metadata = new Map<string, MediaMetadataPatch>();
  const byHash = new Map<string, { key: string; fingerprint: string }>();
  for (const [index, item] of media.entries()) {
    const at = pointer("media", index, "file");
    const before = issues.length;
    const patch = mediaMetadata(item, index, issues);
    const metadataValid = issues.length === before;
    metadata.set(item.key, patch);
    if (!isSafeRelativePath(item.file)) {
      issues.push({ pointer: at, message: "must be a relative path inside the package." });
      continue;
    }
    const path = await containedPath(root, item.file);
    if (path === null) {
      issues.push({ pointer: at, message: "does not exist inside the package directory." });
      continue;
    }
    const info = await stat(path);
    if (!info.isFile()) {
      issues.push({ pointer: at, message: "must name a regular file." });
      continue;
    }
    if (info.size > MAX_MEDIA_BYTES) {
      issues.push({ pointer: at, message: "exceeds the 10 MiB media limit." });
      continue;
    }
    const bytes = new Uint8Array(await readFile(path));
    let mimeType: string;
    try {
      mimeType = detectMediaMimeType(bytes);
    } catch {
      issues.push({
        pointer: at,
        message: "is not an accepted image format (AVIF, GIF, JPEG, PNG or WebP).",
      });
      continue;
    }
    const sha256 = sha256Hex(bytes);
    const fingerprint = metadataFingerprint(patch);
    const twin = byHash.get(sha256);
    if (metadataValid && twin !== undefined && twin.fingerprint !== fingerprint)
      issues.push({
        pointer: pointer("media", index),
        message: `has the same bytes as media "${twin.key}" but different metadata.`,
      });
    if (metadataValid && twin === undefined) byHash.set(sha256, { key: item.key, fingerprint });
    files.set(item.key, {
      path,
      filename: basename(path),
      size: bytes.byteLength,
      sha256,
      mimeType,
    });
  }
  return { files, metadata };
}

/** Reads a verified file again for upload and fails when it changed meanwhile. */
export async function readVerifiedMedia(
  key: string,
  file: PackageMediaFile,
): Promise<Uint8Array<ArrayBuffer>> {
  const bytes = new Uint8Array(await readFile(file.path));
  if (sha256Hex(bytes) !== file.sha256)
    throw new ImportError(
      "IMPORT_FAILED",
      `Media "${key}" changed on disk during the import; rerun lace import.`,
    );
  return bytes;
}
