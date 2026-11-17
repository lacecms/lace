import type { BuildRequest, BuildResult } from "./runner.js";

export interface PreviewJob {
  readonly generationId: string;
  readonly reservationId: string;
}

type Reservation = PreviewJob & {
  readonly source: Promise<string>;
  readonly expiresAt: number;
  commit?: string;
};

interface ActivePreview {
  readonly reservation: Reservation;
  readonly abort: AbortController;
  readonly done: Promise<void>;
}

const sameJob = (left: PreviewJob, right: PreviewJob) =>
  left.generationId === right.generationId && left.reservationId === right.reservationId;

export class BuilderSchedule {
  #publications = 0;
  #queue: Promise<void> = Promise.resolve();
  #reservation: Reservation | undefined;
  #preview: ActivePreview | undefined;

  public constructor(private readonly publish: (request: BuildRequest) => Promise<BuildResult>) {}

  public build(request: BuildRequest): Promise<BuildResult> {
    this.#publications++;
    this.#reservation = undefined;
    const preview = this.#preview?.done;
    const job = this.#queue.then(async () => {
      await preview;
      return this.publish(request);
    });
    this.#queue = job.then(
      () => {
        this.#publications--;
      },
      () => {
        this.#publications--;
      },
    );
    return job;
  }

  public async reserve(job: PreviewJob, source: () => Promise<string>) {
    if (this.#publications > 0 || this.#preview) return { status: "busy" } as const;
    if (this.#reservation && this.#reservation.expiresAt <= Date.now())
      this.#reservation = undefined;
    if (!this.#reservation) {
      this.#reservation = {
        ...job,
        source: Promise.resolve().then(source),
        expiresAt: Date.now() + 15 * 60_000,
      };
    }
    const reservation = this.#reservation;
    if (!sameJob(job, reservation)) return { status: "busy" } as const;
    try {
      const commit = await reservation.source;
      reservation.commit = commit;
      return this.#reservation === reservation && reservation.expiresAt > Date.now()
        ? ({ status: "reserved", commit } as const)
        : ({ status: "busy" } as const);
    } catch {
      if (this.#reservation === reservation) this.#reservation = undefined;
      return { status: "source_unavailable" } as const;
    }
  }

  public dispatch(
    job: PreviewJob,
    execute: (job: PreviewJob, commit: string, signal: AbortSignal) => Promise<void>,
  ): boolean {
    if (this.#preview) return sameJob(job, this.#preview.reservation);
    const reservation = this.#reservation;
    if (!reservation?.commit || !sameJob(job, reservation) || reservation.expiresAt <= Date.now())
      return false;
    this.#reservation = undefined;
    const abort = new AbortController();
    const done = reservation.source
      .then((commit) => {
        abort.signal.throwIfAborted();
        return execute(job, commit, abort.signal);
      })
      .catch(() => {
        console.error(
          JSON.stringify({
            component: "preview-builder",
            generationId: job.generationId,
            reason: "PREVIEW_PROVIDER_UNAVAILABLE",
          }),
        );
      })
      .finally(() => {
        this.#preview = undefined;
      });
    this.#preview = { reservation, abort, done };
    return true;
  }

  public async stop(job: PreviewJob): Promise<void> {
    if (this.#reservation && sameJob(this.#reservation, job)) this.#reservation = undefined;
    const preview = this.#preview;
    if (!preview || !sameJob(preview.reservation, job)) return;
    preview.abort.abort();
    await preview.done;
  }
}
