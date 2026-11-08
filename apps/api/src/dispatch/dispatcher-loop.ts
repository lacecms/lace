export interface DispatchLoop {
  readonly close: () => Promise<void>;
}

/** One bounded sequential poller; a failure is logged and the next poll still runs. */
export function startDispatchLoop(input: {
  readonly build: () => Promise<void>;
  readonly media: () => Promise<void>;
  readonly onError: (error: unknown) => void;
  readonly intervalMs?: number;
}): DispatchLoop {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let current = Promise.resolve();
  const tick = () => {
    current = (async () => {
      for (const dispatch of [input.build, input.media]) {
        try {
          await dispatch();
        } catch (error) {
          input.onError(error);
        }
      }
    })();
    void current.finally(() => {
      if (!stopped) timer = setTimeout(tick, input.intervalMs ?? 1_000);
    });
  };
  tick();
  return {
    close: async () => {
      stopped = true;
      if (timer !== undefined) clearTimeout(timer);
      await current;
    },
  };
}
