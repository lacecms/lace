import { constants } from "node:fs";
import { access, lstat, mkdir, readdir, rm, stat, symlink } from "node:fs/promises";
import { join } from "node:path";

/** Whole-cache bound: a larger cache is cleared before the next build. */
export const BUILD_CACHE_LIMIT_BYTES = 2 * 1024 * 1024 * 1024;

type CacheEvent = "unavailable" | "cleared" | "link_skipped" | "cleanup_failed";

function log(event: CacheEvent, reason?: string): void {
  console.error(
    JSON.stringify({ component: "builder-cache", event, ...(reason ? { reason } : {}) }),
  );
}

/** Persistent caches for one build; every operation degrades to an uncached build. */
export interface BuildCache {
  /** pnpm package store passed to the fixed install. */
  readonly storeDirectory: string;
  /** Points the site's Astro cache directory at the persistent Astro cache. */
  link(siteModules: string): Promise<void>;
  /** Removes the Astro cache, so a corrupt entry cannot fail every retry. */
  dropAstro(): Promise<void>;
}

/** Sums regular file sizes without following links; stops once above `limit`. */
async function exceeds(directory: string, limit: number): Promise<boolean> {
  let total = 0;
  const pending = [directory];
  while (pending.length > 0) {
    const current = pending.pop() as string;
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) pending.push(path);
      else if (entry.isFile()) {
        total += (await lstat(path)).size;
        if (total > limit) return true;
      }
    }
  }
  return false;
}

/**
 * Opens the cache root for one build: an unusable root yields no cache, and a
 * root above `limit` bytes is emptied first. Builds are serial, so no locking.
 */
export async function prepareBuildCache(
  root: string,
  limit = BUILD_CACHE_LIMIT_BYTES,
): Promise<BuildCache | undefined> {
  const storeDirectory = join(root, "pnpm-store");
  const astroDirectory = join(root, "astro");
  const remove = async (path: string) => {
    try {
      await rm(path, { recursive: true, force: true });
    } catch {
      log("cleanup_failed");
    }
  };
  try {
    if (!(await stat(root)).isDirectory()) throw new Error();
    await access(root, constants.W_OK);
    if (await exceeds(root, limit)) {
      // The root itself is a mount point; only its contents are removed.
      for (const name of await readdir(root)) await remove(join(root, name));
      log("cleared", "size_limit");
    }
    await mkdir(storeDirectory, { recursive: true });
    await mkdir(astroDirectory, { recursive: true });
  } catch {
    log("unavailable");
    return undefined;
  }
  return {
    storeDirectory,
    async link(siteModules) {
      const target = join(siteModules, ".astro");
      try {
        await lstat(target);
        log("link_skipped", "exists");
        return;
      } catch {
        /* expected: install never creates the Astro cache directory */
      }
      try {
        await mkdir(astroDirectory, { recursive: true });
        await symlink(astroDirectory, target, "dir");
      } catch {
        log("link_skipped", "unavailable");
      }
    },
    async dropAstro() {
      await remove(astroDirectory);
      log("cleared", "build_failed");
    },
  };
}
