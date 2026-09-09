import * as React from "react";

export const DEMO_WALKTHROUGH_STORAGE_KEY = "distil-demo-walkthrough-dismissed";

/** Persists dismiss across visits; header button can reopen the full guide anytime. */
export function useDemoWalkthrough() {
  const [dismissed, setDismissed] = React.useState(
    () => localStorage.getItem(DEMO_WALKTHROUGH_STORAGE_KEY) === "1",
  );
  const [isExpanded, setIsExpanded] = React.useState(false);

  const dismiss = React.useCallback(() => {
    localStorage.setItem(DEMO_WALKTHROUGH_STORAGE_KEY, "1");
    setDismissed(true);
    setIsExpanded(false);
  }, []);

  const openGuide = React.useCallback(() => {
    setIsExpanded(true);
  }, []);

  return {
    showBanner: !dismissed && !isExpanded,
    showPanel: isExpanded,
    openGuide,
    dismiss,
  };
}
