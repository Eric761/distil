import * as React from "react";
import { DistilMark } from "@/components/brand";
import { Spinner } from "@/components/ui/spinner";
import { pingApi } from "@/lib/api-client";

/**
 * WakeGate keeps our own branded loader on screen while the API becomes
 * reachable, instead of letting the first data request fail against a
 * spun-down (cold-starting) backend.
 *
 * On free hosting (e.g. Render Free), the platform itself may show its own
 * "loading" page *before* our SPA shell is served — that part is outside our
 * control. But once our shell is running, this gate ensures users see the
 * Distil loader (not a broken error) while the API wakes, and it enters the
 * app automatically the moment `/api/ping` returns 200.
 */
export function WakeGate({
  children,
  /** Production-only by default; local `pnpm dev` skips the gate. */
  enabled = import.meta.env.PROD,
}: {
  children: React.ReactNode;
  enabled?: boolean;
}) {
  if (!enabled) return <>{children}</>;

  const [ready, setReady] = React.useState(false);
  // "slow" flips on once the first quick check fails, so we can explain the
  // wait ("waking the server") rather than showing a bare spinner forever.
  const [slow, setSlow] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    async function waitForApi(): Promise<void> {
      // Fast path: most loads are warm. Try once immediately.
      if (await pingApi(controller.signal)) {
        if (!cancelled) setReady(true);
        return;
      }
      if (cancelled) return;
      setSlow(true);

      // Cold start: poll with a small backoff, capped, until the API answers.
      const delays = [1000, 2000, 3000, 5000, 5000, 8000];
      for (let attempt = 0; !cancelled; attempt += 1) {
        const wait = delays[Math.min(attempt, delays.length - 1)]!;
        await new Promise((resolve) => setTimeout(resolve, wait));
        if (cancelled) return;
        if (await pingApi(controller.signal)) {
          if (!cancelled) setReady(true);
          return;
        }
      }
    }

    void waitForApi();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, []);

  if (ready) return <>{children}</>;

  return (
    <div
      className="grid min-h-dvh place-items-center bg-background px-6 text-center"
      role="status"
      aria-live="polite"
    >
      <div className="flex max-w-sm flex-col items-center gap-4">
        <div className="grid size-12 place-items-center rounded-xl bg-primary text-primary-foreground shadow-sm ring-1 ring-inset ring-white/15">
          <DistilMark className="size-6" />
        </div>
        <div className="space-y-1">
          <p className="text-base font-semibold text-foreground">Distil</p>
          <p className="text-sm text-muted-foreground">
            {slow
              ? "Waking the server — this can take up to a minute on the first visit after a while."
              : "Loading…"}
          </p>
        </div>
        <Spinner label={slow ? "Reconnecting…" : "Starting up…"} />
      </div>
    </div>
  );
}
