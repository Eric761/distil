import * as React from "react";
import type { BoundingBox } from "@invoice/contracts";

export interface FocusedSource {
  fieldId: string;
  page: number;
  box: BoundingBox | null;
  text: string;
  label: string;
}

interface ProvenanceContextValue {
  focused: FocusedSource | null;
  focus: (source: FocusedSource) => void;
  clear: () => void;
}

const ProvenanceContext = React.createContext<ProvenanceContextValue | null>(null);

export function ProvenanceProvider({ children }: { children: React.ReactNode }) {
  const [focused, setFocused] = React.useState<FocusedSource | null>(null);
  const value = React.useMemo<ProvenanceContextValue>(
    () => ({
      focused,
      focus: (source) => setFocused(source),
      clear: () => setFocused(null),
    }),
    [focused],
  );
  return <ProvenanceContext.Provider value={value}>{children}</ProvenanceContext.Provider>;
}

export function useProvenance(): ProvenanceContextValue {
  const ctx = React.useContext(ProvenanceContext);
  if (!ctx) throw new Error("useProvenance must be used within ProvenanceProvider");
  return ctx;
}
