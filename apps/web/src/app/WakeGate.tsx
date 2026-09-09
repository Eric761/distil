import * as React from "react";
import { DistilMark } from "@/components/brand";
import { Spinner } from "@/components/ui/spinner";
import { pingApi } from "@/lib/api-client";

/** Don't flash the full loader on warm servers — only show UI after this delay. */
const WAKING_UI_DELAY_MS = 400;
/** Never block the app forever if /api/ping is misconfigured or the API is down. */
const MAX_WAIT_MS = 90_000;
const POLL_DELAYS_MS = [500, 1000, 2000, 3000, 5000, 8000];

const canvasClass =
  "min-h-dvh bg-[hsl(210_40%_96.5%)] bg-gradient-to-b from-[hsl(214_48%_98%)] to-[hsl(210_40%_96.5%)]";

/**
 * WakeGate keeps a branded loader on screen while the API becomes reachable on
 * cold starts. On warm loads the gate stays invisible so users go straight to
 * the app.
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
  const [showWaking, setShowWaking] = React.useState(false);
  const readyRef = React.useRef(false);

  const markReady = React.useCallback(() => {
    readyRef.current = true;
    setReady(true);
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    const wakingTimer = window.setTimeout(() => {
      if (!cancelled && !readyRef.current) setShowWaking(true);
    }, WAKING_UI_DELAY_MS);

    const maxWaitTimer = window.setTimeout(() => {
      if (!cancelled && !readyRef.current) markReady();
    }, MAX_WAIT_MS);

    async function waitForApi(): Promise<void> {
      if (await pingApi(controller.signal)) {
        if (!cancelled) markReady();
        return;
      }

      for (let attempt = 0; !cancelled && !readyRef.current; attempt += 1) {
        const wait = POLL_DELAYS_MS[Math.min(attempt, POLL_DELAYS_MS.length - 1)]!;
        await new Promise((resolve) => window.setTimeout(resolve, wait));
        if (cancelled || readyRef.current) return;
        if (await pingApi(controller.signal)) {
          markReady();
          return;
        }
      }
    }

    void waitForApi();

    return () => {
      cancelled = true;
      controller.abort();
      window.clearTimeout(wakingTimer);
      window.clearTimeout(maxWaitTimer);
    };
  }, [markReady]);

  if (ready) return <>{children}</>;

  if (!showWaking) {
    return <div className={canvasClass} aria-hidden="true" />;
  }

  return (
    <div
      className={`grid place-items-center px-6 py-12 ${canvasClass}`}
      role="status"
      aria-live="polite"
      aria-label="Connecting to Distil"
    >
      <div className="w-full max-w-md rounded-xl border border-border bg-card/90 p-8 text-center shadow-sm backdrop-blur-sm">
        <div className="mx-auto grid size-14 place-items-center rounded-xl bg-primary text-primary-foreground shadow-sm ring-1 ring-inset ring-white/15">
          <DistilMark className="size-7" />
        </div>

        <div className="mt-5 space-y-1">
          <h1 className="text-xl font-semibold tracking-tight text-foreground">Distil</h1>
          <p className="text-sm font-light text-muted-foreground">Structure from Chaos</p>
        </div>

        <div className="mt-6 space-y-3">
          <p className="text-sm leading-relaxed text-muted-foreground">
            Waking the server — first load after idle can take up to a minute on the free tier.
          </p>
          <div className="flex justify-center">
            <Spinner label="Connecting…" />
          </div>
        </div>
      </div>
    </div>
  );
}
