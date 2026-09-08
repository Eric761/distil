import * as React from "react";

interface Announcer {
  announce: (message: string) => void;
}

const AnnouncerContext = React.createContext<Announcer | null>(null);

/** Provides a single polite live region for status announcements. */
export function AnnouncerProvider({ children }: { children: React.ReactNode }) {
  const [message, setMessage] = React.useState("");
  const timeoutRef = React.useRef<ReturnType<typeof setTimeout>>();

  const announce = React.useCallback((next: string) => {
    setMessage("");
    // Clearing then setting ensures repeated identical messages are announced.
    requestAnimationFrame(() => setMessage(next));
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => setMessage(""), 4000);
  }, []);

  const value = React.useMemo(() => ({ announce }), [announce]);

  return (
    <AnnouncerContext.Provider value={value}>
      {children}
      <div aria-live="polite" role="status" className="sr-only">
        {message}
      </div>
    </AnnouncerContext.Provider>
  );
}

export function useAnnouncer(): Announcer {
  const ctx = React.useContext(AnnouncerContext);
  if (!ctx) return { announce: () => undefined };
  return ctx;
}
