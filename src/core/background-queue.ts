/**
 * Background job queue — minimal in-process queue for fire-and-forget tasks.
 * Kept intentionally simple: jobs are deferred to the next tick so they never
 * block the caller, but they still run in the same process lifetime.
 */

export interface BackgroundJob {
  kind: string;
  fn: () => void | Promise<void>;
  important: boolean;
}

export const bg = {
  enqueue(job: BackgroundJob): void {
    console.log(`[bg.enqueue] kind=${job.kind} important=${job.important}`);
    setTimeout(async () => {
      try {
        console.log(`[bg.enqueue] EXECUTING kind=${job.kind}`);
        await job.fn();
        console.log(`[bg.enqueue] DONE kind=${job.kind}`);
      } catch (e) {
        console.error(`[background-queue] ${job.kind} failed:`, e);
      }
    }, 0);
  },
};
