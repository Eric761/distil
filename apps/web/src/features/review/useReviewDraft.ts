import * as React from "react";
import type { ExtractionField, FieldChange } from "@invoice/contracts";

export interface DraftEntry {
  action: FieldChange["action"];
  value?: string;
  candidateId?: string;
}

type Draft = Record<string, DraftEntry>;

type Action =
  | { type: "confirm"; fieldId: string }
  | { type: "correct"; fieldId: string; value: string }
  | { type: "not_applicable"; fieldId: string }
  | { type: "resolve_conflict"; fieldId: string; candidateId: string; value: string }
  | { type: "revert"; fieldId: string }
  | { type: "reset" };

function reducer(state: Draft, action: Action): Draft {
  switch (action.type) {
    case "confirm":
      return { ...state, [action.fieldId]: { action: "confirm" } };
    case "correct":
      return { ...state, [action.fieldId]: { action: "correct", value: action.value } };
    case "not_applicable":
      return { ...state, [action.fieldId]: { action: "not_applicable" } };
    case "resolve_conflict":
      return {
        ...state,
        [action.fieldId]: { action: "resolve_conflict", candidateId: action.candidateId, value: action.value },
      };
    case "revert": {
      const next = { ...state };
      delete next[action.fieldId];
      return next;
    }
    case "reset":
      return {};
    default:
      return state;
  }
}

export interface ReviewDraft {
  draft: Draft;
  dirty: boolean;
  confirm: (fieldId: string) => void;
  correct: (fieldId: string, value: string) => void;
  markNotApplicable: (fieldId: string) => void;
  resolveConflict: (fieldId: string, candidateId: string, value: string) => void;
  revert: (fieldId: string) => void;
  reset: () => void;
  toChanges: () => FieldChange[];
}

export function useReviewDraft(): ReviewDraft {
  const [draft, dispatch] = React.useReducer(reducer, {});

  return {
    draft,
    dirty: Object.keys(draft).length > 0,
    confirm: (fieldId) => dispatch({ type: "confirm", fieldId }),
    correct: (fieldId, value) => dispatch({ type: "correct", fieldId, value }),
    markNotApplicable: (fieldId) => dispatch({ type: "not_applicable", fieldId }),
    resolveConflict: (fieldId, candidateId, value) => dispatch({ type: "resolve_conflict", fieldId, candidateId, value }),
    revert: (fieldId) => dispatch({ type: "revert", fieldId }),
    reset: () => dispatch({ type: "reset" }),
    toChanges: () =>
      Object.entries(draft).map(([fieldId, entry]) => {
        const change: FieldChange = { fieldId, action: entry.action };
        if (entry.value !== undefined) change.value = entry.value;
        if (entry.candidateId !== undefined) change.candidateId = entry.candidateId;
        return change;
      }),
  };
}

/**
 * Local, unsaved view of a field: what value would be effective and whether it
 * still needs attention, given any pending draft entry.
 */
export function projectField(field: ExtractionField, entry: DraftEntry | undefined): {
  displayValue: string;
  reviewLabel: string;
  resolvedLocally: boolean;
  isCorrected: boolean;
} {
  if (!entry) {
    const val = field.effectiveValue;
    return {
      displayValue: val === null || val === undefined ? "" : String(val),
      reviewLabel: field.reviewState,
      resolvedLocally: !field.needsAttention,
      isCorrected: field.reviewState === "corrected",
    };
  }
  if (entry.action === "not_applicable") {
    return { displayValue: "", reviewLabel: "not_applicable", resolvedLocally: true, isCorrected: false };
  }
  if (entry.action === "confirm") {
    const val = field.effectiveValue;
    return {
      displayValue: val === null || val === undefined ? "" : String(val),
      reviewLabel: "confirmed",
      resolvedLocally: true,
      isCorrected: false,
    };
  }
  // correct or resolve_conflict
  return {
    displayValue: entry.value ?? "",
    reviewLabel: "corrected",
    resolvedLocally: true,
    isCorrected: true,
  };
}
