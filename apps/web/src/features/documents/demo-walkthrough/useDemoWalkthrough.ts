import * as React from "react";

export const DEMO_WALKTHROUGH_STORAGE_KEY = "distil-demo-walkthrough-dismissed";

/** Persists dismiss across visits; header button can reopen anytime. */
export function useDemoWalkthrough() {
  const [isOpen, setIsOpen] = React.useState(() => localStorage.getItem(DEMO_WALKTHROUGH_STORAGE_KEY) !== "1");

  const dismiss = React.useCallback(() => {
    localStorage.setItem(DEMO_WALKTHROUGH_STORAGE_KEY, "1");
    setIsOpen(false);
  }, []);

  const open = React.useCallback(() => {
    setIsOpen(true);
  }, []);

  return { isOpen, open, dismiss };
}
