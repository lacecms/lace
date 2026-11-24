import type { ThumbnailCancellation } from "../ports/media-thumbnails.js";

const timers = globalThis as unknown as {
  setTimeout(callback: () => void, delayMs: number): unknown;
  clearTimeout(handle: unknown): void;
};

export async function withThumbnailDeadline<T>(
  timeoutMs: number,
  timeoutError: Error,
  work: (cancellation: ThumbnailCancellation) => Promise<T>,
): Promise<T> {
  let aborted = false;
  const callbacks = new Set<() => void>();
  const cancellation: ThumbnailCancellation = {
    get aborted() {
      return aborted;
    },
    onAbort(callback) {
      if (aborted) callback();
      else callbacks.add(callback);
      return () => callbacks.delete(callback);
    },
  };
  let handle: unknown;
  const timeout = new Promise<never>((_resolve, reject) => {
    handle = timers.setTimeout(() => {
      aborted = true;
      reject(timeoutError);
      for (const callback of callbacks) callback();
      callbacks.clear();
    }, timeoutMs);
  });
  try {
    return await Promise.race([work(cancellation), timeout]);
  } finally {
    timers.clearTimeout(handle);
  }
}

/** Share only admission state across requests. The admitted request owns its I/O. */
export class ThumbnailAdmission {
  private readonly active = new Set<string>();
  private queued = 0;

  public async run<T>(
    key: string,
    cancellation: ThumbnailCancellation,
    busy: Error,
    timeout: Error,
    work: () => Promise<T>,
  ): Promise<T> {
    if (!this.canStart(key)) {
      if (this.queued >= 24) throw busy;
      this.queued++;
      try {
        while (!cancellation.aborted && !this.canStart(key))
          await new Promise<void>((resolve) => timers.setTimeout(resolve, 25));
      } finally {
        this.queued--;
      }
    }
    if (cancellation.aborted) throw timeout;
    this.active.add(key);
    try {
      return await work();
    } finally {
      this.active.delete(key);
    }
  }

  private canStart(key: string): boolean {
    return this.active.size < 2 && !this.active.has(key);
  }
}
