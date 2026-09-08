import { processDueAttempts, recoverStuckAttempts } from "../services/processing-service.js";

const TICK_MS = 500;

let running = false;
let timer: NodeJS.Timeout | null = null;

async function tick(): Promise<void> {
  if (running) return;
  running = true;
  try {
    await processDueAttempts();
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("worker tick failed", error);
  } finally {
    running = false;
  }
}

/** Starts the in-process worker. Recovers stuck jobs, then polls for due work. */
export async function startWorker(): Promise<void> {
  await recoverStuckAttempts();
  timer = setInterval(() => {
    void tick();
  }, TICK_MS);
  // Kick once immediately so freshly-queued work starts fast.
  void tick();
}

export function stopWorker(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
